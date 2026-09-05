/**
 * Writes one line to the install's audit log.
 */
import { Logger } from '@nestjs/common'
import type { IncomingHttpHeaders } from 'node:http'

import type { Database } from '../db/client.js'
import { retentionClassOf } from './retention-class.js'
import { CHANNEL_OF, installActivity } from '../db/schema/install-activity.js'
import { classify } from './ocsf.js'
import { SEVERITY_ID, outcomeOf, severityOf } from './severity.js'

/** One of `installEvent`'s values, as the enum's own type. */
export type InstallEvent = (typeof installActivity.event.enumValues)[number]

/**
 * Who was signed in, if anyone.
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
  headers?: IncomingHttpHeaders | undefined
  /**
   * The OCSF outcome, when the caller knows better than the event does.
   */
  outcome?: 'success' | 'failure' | undefined
}

const log = new Logger('InstallActivity')


/**
 * One line's worth of an untrusted value, safe to interpolate into a log line.
 */
function forOneLine(value: string): string {
  return JSON.stringify(value.slice(0, 200))
}

/**
 * The request's origin, as far as this install can honestly know it.
 */
function originOf(headers: IncomingHttpHeaders | undefined) {
  const one = (value: string | string[] | undefined) =>
    (Array.isArray(value) ? value[0] : value) ?? null
  return {
    ipAddress: one(headers?.['x-real-ip']),
    userAgent: one(headers?.['user-agent']),
  }
}

/**
 * Append one row. Never throws.
 */
export async function recordInstallActivity(
  db: Database,
  input: InstallActivityInput,
): Promise<boolean> {
  const { ipAddress, userAgent } = originOf(input.headers)
  try {
    /**
     * **The OCSF identity is stamped here, from the event alone.**
     */
    const ocsf = classify(input.event)
    const severity = severityOf({ event: input.event, attributes: input.detail })

    await db.insert(installActivity).values({
      event: input.event,
      // **Never from the caller.** A channel a call site chooses is a channel
      // two call sites eventually disagree about, and the disagreement is
      // invisible: both rows land, in different logs.
      channel: CHANNEL_OF[input.event],
      // Stamped here, not derived by the pruner: the statement that
      // destroys rows must not be the one deciding which class they are.
      retentionClass: retentionClassOf(input.event),
      classUid: ocsf.classUid,
      activityId: ocsf.activityId,
      typeUid: ocsf.typeUid,
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
