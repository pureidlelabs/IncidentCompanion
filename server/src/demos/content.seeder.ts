/**
 * Turns a demo's declared content into rows, resolving its symbolic references.
 *
 * Inserts in dependency order, because the references are real foreign keys:
 * an indicator naming a host not yet inserted is refused by Postgres. A
 * reference naming no row throws rather than writing null.
 */
import { Injectable, Inject, Logger } from '@nestjs/common'

import { SEED_DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import {
  accounts,
  cloudApps,
  evidence,
  impact,
  malware,
  methods,
  networkIndicators,
  systems,
  timeline,
  actions,
  caseNotes,
  reports,
  reportBlocks,
} from '../db/schema/index.js'
import * as Y from 'yjs'
import { eq } from 'drizzle-orm'

import { writeProse } from '../domain/prose-authoring.js'
import { DEMO_CONTENT, type DemoContent, type DemoReportBlock } from './content.js'
import { DEMO_REPORTS } from './reports.js'

/**
 * The columns a fixture block becomes, minus the two ids the caller holds.
 *
 * **Named rather than composed inside the insert**, because a field the
 * fixture declares and the insert does not name is lost in silence. A written
 * section carries the words an analyst typed and a generated one carries a
 * language-pack key, so both are read and neither substitutes for the
 * other.
 *
 * Both default to the empty string rather than being left undefined: the
 * columns are `text()` and not nullable, and a null reads back as a heading
 * nothing can render.
 */
export function blockValues(
  block: DemoReportBlock,
  position: number,
): { position: number; kind: string; heading: string; headingKey: string } {
  return {
    position,
    kind: block.kind,
    heading: block.heading ?? '',
    headingKey: block.headingKey ?? '',
  }
}

const REFERENCES: Record<string, Record<string, string>> = {
  systems: { methodId: 'methods' },
  accounts: { methodId: 'methods' },
  malware: { systemId: 'systems', accountId: 'accounts', methodId: 'methods' },
  networkIndicators: { systemId: 'systems', malwareId: 'malware', methodId: 'methods' },
  impact: { systemId: 'systems', accountId: 'accounts' },
  cloudApps: { accountId: 'accounts', methodId: 'methods' },
  evidence: { systemId: 'systems', accountId: 'accounts', methodId: 'methods' },
  timeline: { systemId: 'systems', sourceSystemId: 'systems' },
}

/**
 * Columns that hold a time as **text**, not as a timestamp.
 *
 * `lastActivity` is the value an analyst copies out of a directory export,
 * which is an ISO stamp often enough to look like a timestamp column and not
 * reliably enough to be one.
 */
const TEXT_TIMESTAMPS = new Set(['lastActivity'])

const REFERENCE_LISTS: Record<string, string> = {
  accountIds: 'accounts',
  malwareIds: 'malware',
  networkIndicatorIds: 'networkIndicators',
  cloudAppIds: 'cloudApps',
  evidenceIds: 'evidence',
  methodIds: 'methods',
}

type Ids = Record<string, Record<string, string>>

@Injectable()
export class DemoContentSeeder {
  private readonly log = new Logger(DemoContentSeeder.name)

  /**
   * **`Database | null`, because DI hands this null whenever
   * `SEED_DATABASE_URL` is unset.** A non-nullable type would be a promise the
   * container does not keep. Nothing here reads it -- every write goes through
   * the transaction the caller passes in -- so the first read of it is where
   * the null arrives, and the type is what makes that a compile error rather
   * than a dereference.
   */
  constructor(@Inject(SEED_DATABASE) private readonly db: Database | null) {}

  /**
   * **The demo's clock starts when it is seeded.** Offsets are stored as
   * minutes from that, so a demo always reads as an incident from this week
   * rather than from whenever the fixture was written.
   */
  private at(base: Date, minutes: number): Date {
    return new Date(base.getTime() + minutes * 60_000)
  }

  private resolve(table: string, row: Record<string, unknown>, ids: Ids, base: Date) {
    const out: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(row)) {
      // `isolatedAtMinute` and friends: an offset in the fixture, a timestamp
      // in the column.
      //
      // **Not just `*AtMinute`.** `firstSeen` and `lastActivity` carry a time
      // without saying "at", so a rule keyed on `AtMinute` leaves them holding
      // whatever absolute stamp the fixture was written with, and the demo's
      // "last activity" is pinned to a day in the past for good.
      if (key.endsWith('Minute')) {
        const column = key.slice(0, -'Minute'.length)
        const when = this.at(base, value as number)
        // **`lastActivity` is a text column, not a timestamp.** Handing
        // Drizzle a `Date` for a `text` column inserts whatever `toString`
        // produces, which is a local-timezone string nothing parses back.
        out[column] = TEXT_TIMESTAMPS.has(column) ? when.toISOString() : when
        continue
      }

      const target = REFERENCES[table]?.[key]
      if (target && typeof value === 'string') {
        const id = ids[target]?.[value]
        if (!id) throw new Error(`Demo content names ${target}.${value}, which does not exist.`)
        out[key] = id
        continue
      }

      const listTarget = REFERENCE_LISTS[key]
      if (listTarget && Array.isArray(value)) {
        out[key] = value.map((k) => {
          const id = ids[listTarget]?.[k as string]
          if (!id) throw new Error(`Demo content names ${listTarget}.${String(k)}, which does not exist.`)
          return id
        })
        continue
      }

      out[key] = value
    }
    return out
  }

  /**
   * Insert one group and remember what each key became.
   *
   * Takes the insert rather than the table: Drizzle types an insert against
   * its own table, and a helper generic over every table fights that with
   * casts until nothing is checked at all.
   */
  private async insertGroup(
    name: string,
    group: Record<string, Record<string, unknown>> | undefined,
    ids: Ids,
    base: Date,
    insert: (row: Record<string, unknown>) => Promise<{ id: string }>,
  ): Promise<void> {
    if (!group) return
    ids[name] = {}
    for (const [key, row] of Object.entries(group)) {
      const inserted = await insert(this.resolve(name, row, ids, base))
      ids[name][key] = inserted.id
    }
  }

  /**
   * **Takes the caller's transaction; it must not open its own.** Calling
   * `this.db.transaction()` here runs outside the seeder's transaction, so the
   * cases being filled are uncommitted and every insert fails the `case_id`
   * foreign key. Postgres refuses it on the first row, which is the only
   * reason a store without that key would not silently write entities
   * belonging to a case that does not exist.
   */
  async fill(tx: Database, caseId: string, content: DemoContent, base: Date): Promise<number> {
    {
      const ids: Ids = {}
      // Not `async`: every call hands it an already-awaited array, and the
      // arrow around it is what owes `insertGroup` a promise.
      const one = (rows: { id: string }[]) => rows[0]!

      // Dependency order: methods first, because most collections cite one
      // and a method cites nothing; then hosts and accounts, then everything
      // naming them, then the timeline which names all of it. The references
      // are real foreign keys, so a wrong order is refused rather than stored.
      await this.insertGroup('methods', content.methods, ids, base, async (row) =>
        one(await tx.insert(methods).values({ ...row, caseId } as never).returning({ id: methods.id })),
      )
      await this.insertGroup('systems', content.systems, ids, base, async (row) =>
        one(await tx.insert(systems).values({ ...row, caseId } as never).returning({ id: systems.id })),
      )
      await this.insertGroup('accounts', content.accounts, ids, base, async (row) =>
        one(await tx.insert(accounts).values({ ...row, caseId } as never).returning({ id: accounts.id })),
      )
      await this.insertGroup('malware', content.malware, ids, base, async (row) =>
        one(await tx.insert(malware).values({ ...row, caseId } as never).returning({ id: malware.id })),
      )
      await this.insertGroup('networkIndicators', content.networkIndicators, ids, base, async (row) =>
        one(
          await tx
            .insert(networkIndicators)
            .values({ ...row, caseId } as never)
            .returning({ id: networkIndicators.id }),
        ),
      )
      await this.insertGroup('cloudApps', content.cloudApps, ids, base, async (row) =>
        one(await tx.insert(cloudApps).values({ ...row, caseId } as never).returning({ id: cloudApps.id })),
      )
      await this.insertGroup('evidence', content.evidence, ids, base, async (row) =>
        one(await tx.insert(evidence).values({ ...row, caseId } as never).returning({ id: evidence.id })),
      )
      // **After evidence, because it cites it.** `evidenceIds` resolves demo
      // keys to ids that only exist once the evidence group has been inserted,
      // and the resolver throws by name rather than writing a dangling id.
      await this.insertGroup('impact', content.impact, ids, base, async (row) =>
        one(await tx.insert(impact).values({ ...row, caseId } as never).returning({ id: impact.id })),
      )

      // Neither is referenced by anything, so order does not matter here -
      // they are last because they are the analyst's own work rather than
      // evidence about the intrusion.
      await this.insertGroup('actions', content.actions, ids, base, async (row) =>
        one(await tx.insert(actions).values({ ...row, caseId } as never).returning({ id: actions.id })),
      )
      await this.insertGroup('caseNotes', content.caseNotes, ids, base, async (row) =>
        one(await tx.insert(caseNotes).values({ ...row, caseId } as never).returning({ id: caseNotes.id })),
      )

      await this.fillReports(tx, caseId, content, base)

      let entries = 0
      for (const entry of content.timeline ?? []) {
        const { atMinute, ...rest } = entry
        await tx.insert(timeline).values({
          ...(this.resolve('timeline', rest, ids, base) as Record<string, never>),
          caseId,
          time: this.at(base, atMinute),
        } as never)
        entries += 1
      }
      return entries
    }
  }

  /**
   * Writes the reports a demo ships with, and the prose inside them.
   *
   * Three writes per report, in a forced order: the blocks need the report's
   * id, and the one document per report is keyed by the *block* ids, so it
   * cannot be built until they exist.
   *
   * Seeds every report as a draft and drops any `sentAtMinute` the fixture
   * declares - `demo-reports/sender.service.ts` sends them afterwards, and
   * logs how many it applied to.
   */
  private async fillReports(
    tx: Database,
    caseId: string,
    content: DemoContent,
    base: Date,
  ): Promise<void> {
    // **Keyed by reference rather than inlined into `DemoContent`.**
    // The prose outweighs every entity fixture in this file put together, and
    // holding it beside them would bury them.
    const listed = content.reports ?? DEMO_REPORTS[content.reference] ?? []
    const unsendable = listed.filter((report) => report.sentAtMinute !== undefined).length
    if (unsendable > 0) {
      this.log.log(
        `${content.reference}: ${unsendable} report(s) declare a send stamp and are seeded as ` +
          'drafts - a sent report needs a frozen document, which the seeder cannot render.',
      )
    }
    for (const report of listed) {
      const [row] = await tx
        .insert(reports)
        .values({
          caseId,
          label: report.label,
          template: report.template,
          tlp: report.tlp ?? '',
          stage: report.stage ?? null,
          language: report.language ?? 'en',
          status: report.status ?? 'draft',
          createdAt: this.at(base, report.createdAtMinute),
        } as never)
        .returning({ id: reports.id })

      const reportId = row!.id
      const doc = new Y.Doc({ gc: false })
      let wrote = false

      for (const [position, block] of report.blocks.entries()) {
        const [made] = await tx
          .insert(reportBlocks)
          .values({ caseId, reportId, ...blockValues(block, position) } as never)
          .returning({ id: reportBlocks.id })

        if (block.body) {
          writeProse(doc, made!.id, block.body)
          wrote = true
        }
      }

      if (wrote) {
        await tx
          .update(reports)
          .set({ document: Buffer.from(Y.encodeStateAsUpdate(doc)) })
          .where(eq(reports.id, reportId))
      }
    }
  }

  /**
   * Fill every demo that declares content, inside the seeder's transaction.
   *
   * **`baseFor`, not one `base`.** A demo declares how far back it begins, so
   * the base is per case rather than one clock for all of them.
   * -> `catalogue.ts`'s `startedDaysAgo`
   */
  async fillAll(
    tx: Database,
    byReference: Map<string | null, string>,
    baseFor: (reference: string) => Date,
  ): Promise<void> {
    for (const content of DEMO_CONTENT) {
      const caseId = byReference.get(content.reference)
      if (!caseId) continue
      const entries = await this.fill(tx, caseId, content, baseFor(content.reference))
      this.log.log(`${content.reference}: ${entries} timeline entries and its entities`)
    }
  }
}
