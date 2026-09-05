/**
 * Reads the audit log, and records that it was read.
 */
import { Inject, Injectable } from '@nestjs/common'
import type { UserSession } from '@thallesp/nestjs-better-auth'
import { and, count, desc, eq, gte, inArray, lt, sql, type SQL } from 'drizzle-orm'
import type { IncomingHttpHeaders } from 'node:http'

import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { readPolicy } from '../policy/read.js'
import { installActivity, type InstallChannel } from '../db/schema/install-activity.js'
import { recordInstallActivity } from '../install-activity/record.js'
import {
  FAILURES,
  RUN_IS_AN_ATTACK,
  SEVERITY_ID,
  SEVERITY_NAME,
} from '../install-activity/severity.js'
import { CATEGORY_OF, CLASS_NAME_OF, metadataFor, nameOfActivity } from '../install-activity/ocsf.js'
import type { ActivityPage } from './activity.controller.js'

export interface Asked {
  channel?: InstallChannel | undefined
  /**
   * OCSF `severity_id` floor, applied to the level the reader is shown.
   */
  minSeverity?: number | undefined
  after?: string | undefined
  since?: string | undefined
  limit: number
}

/**
 * How long a browse counts as one visit.
 */
export const READ_IS_ONE_VISIT_FOR_MINUTES = 60

/**
 * The window a run of the same event from the same origin is counted in.
 */
// The window is read per query - the default lives in `policy/keys.ts`, so a
// second copy here would be one to keep true.

/**
 * The level a run earns, which the writer could not have known - **in SQL,
 * because the filter and the column have to be the same number.**
 */
function raisedSeverity(window: SQL) {
  // **`inArray`, not `= any(...)`.** Drizzle binds a JS array as a single
  // parameter, which Postgres refuses with `op ANY/ALL (array) requires array
  // on right side`; `inArray` expands it into a list.
  return sql<number>`greatest(
    ${installActivity.severityId},
    case
      when ${inArray(installActivity.event, [...FAILURES])}
       and count(*) over (${window}) >= ${RUN_IS_AN_ATTACK}::int
      then ${SEVERITY_ID.High}::int
      else ${SEVERITY_ID.Informational}::int
    end
  )::int`
}

@Injectable()
export class InstallActivityReadService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async page(
    asked: Asked,
    session: UserSession,
    headers: IncomingHttpHeaders,
  ): Promise<ActivityPage> {
    await this.noteTheRead(session, headers)

    const policy = await readPolicy(this.db)
    const runWindowSeconds = policy['audit.runWindowMinutes'] * 60

    const where = [
      asked.channel ? eq(installActivity.channel, asked.channel) : undefined,
      // Descending, so "after this cursor" means older than it.
      asked.after ? lt(installActivity.seq, BigInt(asked.after)) : undefined,
      asked.since ? gte(installActivity.at, new Date(asked.since)) : undefined,
    ].filter(Boolean)

    /**
     * **One row per run, not per event.**
     */
    const window = sql`
      partition by ${installActivity.event},
                   coalesce(${installActivity.actorId}, ''),
                   coalesce(${installActivity.targetLabel}, ''),
                   coalesce(${installActivity.ipAddress}, ''),
                   floor(extract(epoch from ${installActivity.at}) / ${runWindowSeconds})
    `

    const runs = this.db
      .select({
        seq: installActivity.seq,
        id: installActivity.id,
        event: installActivity.event,
        channel: installActivity.channel,
        classUid: installActivity.classUid,
        activityId: installActivity.activityId,
        typeUid: installActivity.typeUid,
        severityId: installActivity.severityId,
        statusId: installActivity.statusId,
        at: installActivity.at,
        actorLabel: installActivity.actorLabel,
        targetLabel: installActivity.targetLabel,
        detail: installActivity.detail,
        ipAddress: installActivity.ipAddress,
        userAgent: installActivity.userAgent,
        runLength: sql<number>`count(*) over (${window})::int`.as('run_length'),
        raisedSeverityId: raisedSeverity(window).as('raised_severity_id'),
        runHead: sql<string>`max(${installActivity.seq}) over (${window})`.as('run_head'),
      })
      .from(installActivity)
      .where(where.length ? and(...where) : undefined)
      .as('runs')

    const rows = await this.db
      .select({
        seq: runs.seq,
        id: runs.id,
        event: runs.event,
        channel: runs.channel,
        classUid: runs.classUid,
        activityId: runs.activityId,
        typeUid: runs.typeUid,
        severityId: runs.raisedSeverityId,
        statusId: runs.statusId,
        at: runs.at,
        actorLabel: runs.actorLabel,
        targetLabel: runs.targetLabel,
        detail: runs.detail,
        ipAddress: runs.ipAddress,
        userAgent: runs.userAgent,
        runLength: runs.runLength,
      })
      .from(runs)
      .where(
        and(
          // Only the newest line of each run stands for it.
          sql`${runs.seq} = ${runs.runHead}`,
          // **On the raised level, and applied here rather than after the
          // fetch.** A floor read against the stored column would drop a run
          // the page draws as High, which hides exactly the lines somebody
          // reaches for a severity filter to find.
          asked.minSeverity === undefined
            ? undefined
            : gte(runs.raisedSeverityId, asked.minSeverity),
        ),
      )
      .orderBy(desc(runs.seq))
      // One more than asked, so "is there another page" needs no second query
      // and no count over the whole table.
      .limit(asked.limit + 1)

    const page = rows.slice(0, asked.limit)
    const more = rows.length > asked.limit

    const tallies = await this.db
      .select({ channel: installActivity.channel, n: count() })
      .from(installActivity)
      .groupBy(installActivity.channel)

    /**
     * **Counted over the whole log, like the channel tallies, and grouped on the
     * stored `status_id`.**
     */
    const outcomes = await this.db
      .select({ statusId: installActivity.statusId, n: count() })
      .from(installActivity)
      .groupBy(installActivity.statusId)

    /**
     * **Counted on the raised level, over runs, because that is what pressing the
     * chip returns.**
     */
    const severities = await this.db
      .select({ severityId: runs.raisedSeverityId, n: count() })
      .from(runs)
      .where(sql`${runs.seq} = ${runs.runHead}`)
      .groupBy(runs.raisedSeverityId)

    return {
      events: page.map((row) => ({
        seq: String(row.seq),
        id: row.id,
        event: row.event,
        channel: row.channel,
        // **Read from the row, not re-derived.** The classification was
        // decided when the event happened; a reader that recomputed it could
        // disagree with an exporter that did not.
        categoryUid: CATEGORY_OF[row.classUid] ?? 0,
        classUid: row.classUid,
        className: CLASS_NAME_OF[row.classUid] ?? 'Unknown',
        activityId: row.activityId,
        activityName: nameOfActivity(row.classUid, row.activityId),
        typeUid: row.typeUid,
        // OCSF requires `metadata`; the channel is its `log_name`.
        metadata: metadataFor(row.channel),
        outcome: row.statusId === 2 ? 'failure' : 'success',
        statusId: row.statusId,
        /**
         * **The stored level is a floor and the run can raise it.**
         */
        severityId: row.severityId,
        severity: SEVERITY_NAME[row.severityId] ?? 'Informational',
        at: row.at.toISOString(),
        actorLabel: row.actorLabel,
        targetLabel: row.targetLabel,
        attributes: row.detail,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
        runLength: row.runLength,
      })),
      nextCursor: more ? String(page.at(-1)?.seq ?? '') : null,
      counts: Object.fromEntries(tallies.map((one) => [one.channel, one.n])),
      outcomes: Object.fromEntries(
        outcomes.map((one) => [one.statusId === 2 ? 'failure' : 'success', one.n]),
      ),
      severities: severities.reduce<Record<string, number>>((into, one) => {
        const name = SEVERITY_NAME[one.severityId] ?? 'Informational'
        return { ...into, [name]: (into[name] ?? 0) + one.n }
      }, {}),
    }
  }

  /**
   * One line per reader per hour, rather than one per request.
   */
  private async noteTheRead(session: UserSession, headers: IncomingHttpHeaders): Promise<void> {
    const since = new Date(Date.now() - READ_IS_ONE_VISIT_FOR_MINUTES * 60_000)
    const [already] = await this.db
      .select({ id: installActivity.id })
      .from(installActivity)
      .where(
        and(
          eq(installActivity.event, 'audit_read'),
          eq(installActivity.actorId, session.user.id),
          gte(installActivity.at, since),
        ),
      )
      .limit(1)
    if (already) return

    await recordInstallActivity(this.db, {
      event: 'audit_read',
      actor: { id: session.user.id, label: session.user.name || session.user.email },
      headers,
    })
  }
}
