/**
 * Writes one line to the install's audit log.
 *
 * The only thing that inserts into `install_activity`. Readers come later; the
 * writer is the half that cannot be backfilled, because every day without it
 * is a day of history nothing can recover.
 *
 * **A function rather than only a service, because there are two callers and
 * one of them is not in the container.** The routes inject
 * `InstallActivityService`; Better Auth's `databaseHooks` run inside
 * `auth.config.ts`, which builds its own handle before Nest exists. Both reach
 * this, so there is one place that knows what a row looks like.
 */
import { Logger } from '@nestjs/common'
import type { IncomingHttpHeaders } from 'node:http'

import type { Database } from '../db/client.js'
import { callerAddress } from '../wire/caller-address.js'
import { retentionClassOf } from './retention-class.js'
import { CHANNEL_OF, installActivity } from '../db/schema/install-activity.js'
import { OCSF_VERSION, classify } from './ocsf.js'
import { SEVERITY_ID, outcomeOf, severityOf } from './severity.js'

export type InstallEvent = (typeof installActivity.event.enumValues)[number]

/**
 * Who was signed in, if anyone.
 *
 * **The caller's own session, never "whoever is admin".** Every route that
 * writes here already holds the request; this is the shape it hands over.
 */
export interface Actor {
  id?: string | null | undefined
  label?: string | null | undefined
}

export interface InstallActivityInput {
  event: InstallEvent
  actor?: Actor | undefined
  /** The account, regime or language tag this was done to. */
  target?: string | null | undefined
  detail?: Record<string, string> | undefined
  /**
   * A live request's headers, from which the address is derived under the
   * trust rule. The caller's until that rule clears it.
   */
  headers?: IncomingHttpHeaders | undefined
  /**
   * An origin the install resolved for itself, written as given.
   *
   * **Separate from `headers` because the provenance differs, and the trust
   * rule must not be applied twice.** A session row's address was resolved
   * when the session was made; re-deciding it against the mode discards what
   * the install already established. The sign-in line is written from the row
   * rather than from the request that produced it, which is why it takes this
   * and not `headers`.
   */
  origin?: { ipAddress?: string | null; userAgent?: string | null } | undefined
  /**
   * The OCSF outcome, when the caller knows better than the event does.
   *
   * **The boundary knows and the event does not.** `outcomeOf` reads the
   * event, which is right for `sign_in_failed` - a refusal with its own name -
   * and wrong for a write that threw: `api_called` is the same event whether
   * it worked or not, so the interceptor supplies the answer it watched.
   */
  outcome?: 'success' | 'failure' | undefined
}

const log = new Logger('InstallActivity')


/**
 * One line's worth of an untrusted value, safe to interpolate into a log line.
 *
 * **The value is attacker-supplied on the event most likely to fail.** A
 * failed sign-in records the address that was typed, so a newline in it forges
 * however many lines the attacker likes in the operator's log - and the line
 * announcing the attack is the one they get to write. CWE-117; the OWASP
 * Logging Cheat Sheet asks for CR, LF and delimiters to be sanitized on all
 * event data.
 *
 * **Escaped rather than stripped**, because which account was attacked is the
 * reason the field is recorded, and length-capped because a log line is not
 * where an attacker gets to choose how much disk to spend.
 *
 * The table needs none of this: a `text` column and a `jsonb` value cannot
 * forge a second row. This is the one surface in the writer that is
 * line-oriented.
 */
function forOneLine(value: string): string {
  return JSON.stringify(value.slice(0, 200))
}

/**
 * The request's origin, as far as this install can honestly know it.
 *
 * **The address is decided by `callerAddress` rather than read here**, so the
 * audit believes the header on exactly the same terms the two rate limiters
 * do. No socket is passed: this writes from a request it was handed rather
 * than one it is holding, and inventing an address for the line would be the
 * forgery the column exists to prevent. -> `wire/caller-address.ts`
 *
 * The agent is caller text in every mode and is not a partition column of the
 * reader's run window, so it is recorded rather than dropped; `forOneLine` is
 * what makes it safe to put in a log line.
 */
function originOf(headers: IncomingHttpHeaders | undefined) {
  const one = (value: string | string[] | undefined) =>
    (Array.isArray(value) ? value[0] : value) ?? null
  return {
    ipAddress: callerAddress(headers ?? {}, undefined),
    userAgent: one(headers?.['user-agent']),
  }
}

/**
 * Append one row. Never throws.
 *
 * **A failed write is swallowed, and that is the deliberate half.** An audit
 * line is a consequence of the thing that happened, not a precondition for it
 * - so a broken log must not turn a successful role change into a 500 the
 * administrator retries, writing the change twice. What it must not do is fail
 * *silently*: the failure goes to the Nest logger at `error`, which is where
 * an operator looks and what `record.test.ts` asserts.
 *
 * **Returns whether the line landed**, because one caller has to know. A typed
 * method marks the request accounted for so the boundary stays quiet; marking
 * after a write that did not happen means the act is recorded nowhere at all,
 * which is the one outcome worse than a vague line.
 */
export async function recordInstallActivity(
  db: Database,
  input: InstallActivityInput,
): Promise<boolean> {
  const { ipAddress, userAgent } = input.origin
    ? { ipAddress: input.origin.ipAddress ?? null, userAgent: input.origin.userAgent ?? null }
    : originOf(input.headers)
  try {
    /**
     * **The OCSF identity is stamped here, from the event alone.** It is a
     * property of what happened, not of who reads it - so it is decided once,
     * on the way in, and every consumer agrees without re-deriving.
     *
     * `severityId` is the one part that reads more than the event: a run of
     * failures is louder than one. `runLength` is unknown at write time and
     * defaults to 1, so the stored level is the *floor* and the reader raises
     * it when it can see the neighbours. Both are the framework's numbers.
     */
    const ocsf = classify(input.event)
    const severity = severityOf({ event: input.event, attributes: input.detail })

    await db.insert(installActivity).values({
      event: input.event,
      // **Never from the caller.** A channel a call site chooses is a channel
      // two call sites eventually disagree about, and the disagreement is
      // invisible: both rows land, in different logs.
      channel: CHANNEL_OF[input.event],
      retentionClass: retentionClassOf(input.event),
      classUid: ocsf.classUid,
      activityId: ocsf.activityId,
      typeUid: ocsf.typeUid,
      // Stamped beside the ids it describes: they were decided under this
      // version, and a later build's constant does not apply to them.
      schemaVersion: OCSF_VERSION,
      severityId: SEVERITY_ID[severity],
      statusId: (input.outcome ?? outcomeOf(input.event)) === 'failure' ? 2 : 1,
      actorId: input.actor?.id ?? null,
      actorLabel: input.actor?.label ?? null,
      targetLabel: input.target ?? null,
      detail: input.detail ?? {},
      ipAddress,
      userAgent,
    })
    return true
  } catch (why) {
    log.error(
      `install activity not recorded: ${input.event}${
        input.target ? ` on ${forOneLine(input.target)}` : ''
      }`,
      why instanceof Error ? why.stack : String(why),
    )
    return false
  }
}
