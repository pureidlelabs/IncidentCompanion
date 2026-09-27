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

import { sql } from 'drizzle-orm'

import type { Executor } from '../db/scope.js'
import { callerAddress } from '../wire/caller-address.js'
import { retentionClassOf } from './retention-class.js'
import { CHANNEL_OF, installActivity } from '../db/schema/install-activity.js'
import { user } from '../db/schema/auth.js'
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
 * **The value is attacker-supplied wherever a refusal names what was asked
 * for.** A refused request records the method the caller sent, so a newline in
 * it forges however many lines the attacker likes in the operator's log - and
 * the line announcing the attack is the one they get to write. CWE-117; the
 * OWASP Logging Cheat Sheet asks for CR, LF and delimiters to be sanitized on
 * all event data.
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
 * audit attributes a request exactly as the two rate limiters and the session
 * record do. -> `wire/caller-address.ts`
 *
 * The agent is caller text in every mode and is not a partition column of the
 * reader's run window, so it is recorded rather than dropped; `forOneLine` is
 * what makes it safe to put in a log line.
 */
function originOf(headers: IncomingHttpHeaders | undefined) {
  const one = (value: string | string[] | undefined) =>
    (Array.isArray(value) ? value[0] : value) ?? null
  return {
    ipAddress: callerAddress(headers ?? {}),
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
  db: Executor,
  input: InstallActivityInput,
): Promise<boolean> {
  try {
    await writeInstallActivity(db, input)
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

/**
 * The same line, for a caller whose own act must fail with it.
 *
 * @throws whatever the store answers, leaving any transaction `db` is aborted
 */
export async function writeInstallActivity(db: Executor, input: InstallActivityInput): Promise<void> {
  const { ipAddress, userAgent } = input.origin
    ? { ipAddress: input.origin.ipAddress ?? null, userAgent: input.origin.userAgent ?? null }
    : originOf(input.headers)
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
    // Null where the account is gone, as it would be had it gone after the
    // line: a session can outlive its account, and the label still says who.
    actorId: input.actor?.id
      ? sql`(select ${user.id} from ${user} where ${user.id} = ${input.actor.id})`
      : null,
    actorLabel: input.actor?.label ?? null,
    targetLabel: input.target ?? null,
    detail: input.detail ?? {},
    ipAddress,
    userAgent,
  })
}
