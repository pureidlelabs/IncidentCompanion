/**
 * Reads the audit log, and records that it was read.
 *
 * **OWASP asks for the second half**: *"all access to the logs must be
 * recorded"*. An audit nobody can tell has been read is one an administrator
 * can browse for somebody else's sign-in times without leaving a mark.
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
   *
   * **Absent from this interface is how it went inert.** The controller parsed
   * and documented `minSeverity` for weeks while nothing here read it: the
   * handler passes its parsed object as a variable, and excess-property
   * checking does not fire on one - so a field this interface omits is
   * dropped by the type system in silence rather than refused.
   */
  minSeverity?: number | undefined
  after?: string | undefined
  since?: string | undefined
  limit: number
}

/**
 * How long a browse counts as one visit.
 *
 * **A collector polling every five minutes would otherwise write a line every
 * five minutes**, and an audit whose bulk is "the audit was read" is one
 * nobody scrolls through. One line an hour per reader answers *who has been
 * looking*, which is the question the control exists for.
 */
export const READ_IS_ONE_VISIT_FOR_MINUTES = 60

/**
 * The window a run of the same event from the same origin is counted in.
 *
 * **Buckets rather than a sliding window**, because a sliding one is a
 * correlated subquery per row. The cost is real and worth stating: three
 * failures either side of a bucket boundary read as two runs of one and two
 * rather than one run of three. It under-reports and never over-reports, which
 * is the direction to be wrong in for something that raises an alarm.
 */
// The window is read per query - the default lives in `policy/keys.ts`, so a
// second copy here would be one to keep true.

/**
 * The level a run earns, which the writer could not have known - **in SQL,
 * because the filter and the column have to be the same number.**
 *
 * `severityOf` decides every other level from what the row already holds, so
 * the writer stamped those correctly; the run-length clause is the only one
 * that needs the whole table to evaluate, and it is the only one restated
 * here. Restating it in TypeScript over the fetched page instead would have
 * meant `minSeverity` filtering on one value and the `Severity` column showing
 * another - and a page short of its limit, since the cut would fall after it.
 *
 * **The set of failure events is imported rather than retyped**, which is the
 * half of the rule that grows; the comparison is the half that does not.
 * `read.test.ts` pins the two against each other.
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
     * **One row per run, not per event.** Identical events from one origin
     * inside a five-minute bucket are one thing that happened; drawing each
     * separately turns a page into twenty copies of one fact and buries
     * everything that is not a sign-in.
     *
     * **The partition is event, actor, target, origin and bucket** - all
     * five, because anything less merges facts. Measured 2026-08-23: with the
     * target left out, five cases created in one minute collapsed to one line
     * reading `Case created x5`, which is a different and false statement.
     *
     * The outer filter
     * keeps only the newest row of each, so the line carries the most recent
     * timestamp and the count of what it stands for. Both are computed over
     * the filtered table rather than the page, because a run that straddles a
     * page boundary is still one run and counting within the page would make
     * the same event louder or quieter depending on where somebody scrolled.
     *
     * **The cost is a window over everything the filters admit**, which is
     * what the `since` default is for: an unbounded range on a large log scans
     * it all. Bounded by `install_activity_channel_at_idx`.
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
     * **Counted over the whole log, like the channel tallies, and grouped on
     * the stored `status_id`.** The first version grouped on the event and
     * mapped each to an outcome in JavaScript - which re-derived a value the
     * row already carries, and counted outcomes on the page while channels
     * were counted on the table.
     */
    const outcomes = await this.db
      .select({ statusId: installActivity.statusId, n: count() })
      .from(installActivity)
      .groupBy(installActivity.statusId)

    /**
     * **Counted on the raised level, over runs, because that is what pressing
     * the chip returns.** The earlier version tallied the stored floor and
     * argued that a filter would narrow on the same number - which stopped
     * being true the moment `minSeverity` was honoured against the level the
     * reader is shown. A run of failures drawn as High was counted as Low, so
     * the `High` chip read zero over a page of High lines and disabled itself.
     *
     * **The window is the page's own, not a second one over the whole table.**
     * `runs` is already built and already filtered; grouping the run heads
     * costs a group-by rather than the extra scan the floor was chosen to
     * avoid. It counts runs where the channel tallies count events - which is
     * the unit the page draws, and the unit the chip's number has to match.
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
         * **The stored level is a floor and the run can raise it.** Severity
         * is the one field a writer cannot fully know: it has no view of the
         * neighbouring rows, so a lone failure stores Low and the fifth in
         * five minutes reads High. Never lowered - a stored level that a
         * reader could quieten would be a level nobody can rely on.
         *
         * Already raised by `raisedSeverity` in the query, so that the number
         * `minSeverity` filtered on is the number this column shows.
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
   *
   * **A read of the audit is not a page of the audit.** Scrolling writes a
   * request per page and a collector writes one every five minutes; recording
   * each would bury the fifteen lines that say what was actually done to the
   * install under a thousand that say somebody looked.
   *
   * The check is a query rather than a cache, because a cache is per process
   * and the answer has to be per installation.
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
