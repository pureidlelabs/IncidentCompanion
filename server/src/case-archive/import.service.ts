/**
 * A `.iccase`, in - as a **new case**, never as a restore over an old one.
 *
 * Every row is created fresh: new ids throughout with the references between
 * rows remapped, versions restarting at 1, and attribution naming whoever
 * imported it. Evidence rows keep their digests, so a handover archive
 * imports rows whose files are absent.
 */
import { Inject, Injectable, Logger, UnprocessableEntityException } from '@nestjs/common'
import { getTableColumns, sql } from 'drizzle-orm'

import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { EvidenceStore } from '../evidence/store.js'
import { BadArchive, CASE_NAME, EVIDENCE_PREFIX, PROSE_PREFIX, readArchive } from '../archive/format.js'
import { MalformedEnvelope, WrongPassphrase, isSealed, open } from '../archive/envelope.js'
import { REFERENCE_FIELD_NAMES } from '../domain/collections.js'
import { z } from 'zod'
import {
  accounts,
  actions,
  caseNotes,
  cases,
  changeFeed,
  cloudApps,
  evidence,
  methods,
  impact,
  malware,
  networkIndicators,
  reportBlocks,
  reports,
  systems,
  timeline,
} from '../db/schema/index.js'

/**
 * The order rows are written in, and it is a dependency order rather than a
 * preference: a timeline entry references a system, an impact row references an
 * account, and a report block references its report.
 *
 * A row written before the row it points at finds nothing in `remap`, so a
 * scalar becomes null and a list member is dropped, silently.
 * `import-order.test.ts` derives the dependencies from the schemas and checks
 * this order against them.
 */
export const TABLES = [
  /**
   * **First, because a method points at nothing and eight collections point at
   * it.** A reference back from here is a cycle, which `import-order.test.ts`
   * refuses.
   */
  ['methods', methods],
  ['systems', systems],
  ['accounts', accounts],
  // Before indicators, which name it through `malwareId`.
  ['malware', malware],
  ['networkIndicators', networkIndicators],
  ['cloudApps', cloudApps],
  ['evidence', evidence],
  ['impact', impact],
  ['timeline', timeline],
  ['actions', actions],
  ['casenotes', caseNotes],
  ['reports', reports],
  ['reportBlocks', reportBlocks],
] as const

/** Columns an import never carries over, whatever the archive says. */
const NEVER_CARRIED = new Set([
  'id',
  'caseId',
  'version',
  'createdAt',
  'updatedAt',
  'createdBy',
  'updatedBy',
])

/**
 * An id from the archive, as the row it became here.
 *
 * **A list is filtered, never nulled.** Every reference list is a `jsonb`
 * column that is `NOT NULL DEFAULT []`, so writing null to one raises 23502
 * and fails the whole import -- an id that resolves to nothing is dropped from
 * the list instead, which is what a deleted row already looks like there.
 *
 * A scalar that resolves to nothing becomes null, which those columns allow.
 */
function remapped(value: unknown, remap: ReadonlyMap<string, string>): unknown {
  if (Array.isArray(value)) {
    return value.flatMap((one) => {
      const found = typeof one === 'string' ? remap.get(one) : undefined
      return found === undefined ? [] : [found]
    })
  }
  if (typeof value === 'string') return remap.get(value) ?? null
  return value
}

export const importResultSchema = z.object({
  id: z.uuid().describe('The case that was created. Never the id the archive carried.'),
  title: z.string(),
  rows: z.number().int().describe('Rows restored, across every table.'),
  attachments: z
    .enum(['included', 'omitted'])
    .describe('Whether the archive carried the evidence bytes or only the rows describing them.'),
  missingFiles: z
    .number()
    .int()
    .describe("Digests the archive's rows name and the archive did not carry."),
})

export type ImportResult = z.infer<typeof importResultSchema>

@Injectable()
export class ArchiveImportService {
  private readonly log = new Logger(ArchiveImportService.name)

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(EvidenceStore) private readonly store: EvidenceStore,
  ) {}

  async load(archive: Buffer, passphrase: string, actorId: string): Promise<ImportResult> {
    const plain = await this.unsealed(archive, passphrase)
    const { members, attachments } = await readArchive(plain)

    const raw = members[CASE_NAME]
    if (!raw) throw new BadArchive('this archive carries no case')
    let record: Record<string, unknown>
    try {
      record = JSON.parse(Buffer.from(raw).toString('utf8')) as Record<string, unknown>
    } catch {
      throw new BadArchive("this archive's case record is unreadable")
    }
    if (typeof record.title !== 'string' || !record.title.trim()) {
      throw new BadArchive('this archive names no case')
    }

    // **The artefacts land before the rows that point at them.** A row written
    // first would, for the moment between, describe a file this install does
    // not hold - and a failure in between would leave exactly that.
    let missingFiles = 0
    const held = new Set<string>()
    for (const [name, bytes] of Object.entries(members)) {
      if (!name.startsWith(EVIDENCE_PREFIX)) continue
      const stored = await this.store.put(
        // `async` with nothing to await is the signature's doing: `put` reads
        // an async iterable, and a plain generator is not one.
        // eslint-disable-next-line @typescript-eslint/require-await
        (async function* () {
          yield Buffer.from(bytes)
        })(),
      )
      held.add(stored.hash)
    }

    return this.db.transaction(async (tx) => {
      const [made] = await tx
        .insert(cases)
        .values({
          title: String(record.title),
          reference: typeof record.reference === 'string' ? record.reference : '',
          customer: typeof record.customer === 'string' ? record.customer : '',
          summary: typeof record.summary === 'string' ? record.summary : '',
          createdBy: actorId,
          updatedBy: actorId,
        })
        .returning()
      const caseId = made!.id

      // Between the insert and every row after it, for the same reason
      // `CasesService.create` does it - the scope is learned from the insert.
      await tx.execute(sql`select set_config('app.case_id', ${caseId}, true)`)
      await tx.insert(changeFeed).values({
        caseId,
        entity: 'cases',
        entityId: caseId,
        op: 'insert',
        version: made!.version,
        actorId,
        fields: [],
      })

      /**
       * Old id -> new id, across every collection at once.
       *
       * **Flat rather than per collection**, which is what makes
       * `REFERENCE_FIELD_NAMES` enough: an id is unique across the install, so
       * remapping one never needs to know which table it came from.
       */
      const remap = new Map<string, string>()
      let rows = 0

      for (const [name, table] of TABLES) {
        const incoming = record[name]
        if (!Array.isArray(incoming) || incoming.length === 0) continue

        // **`getTableColumns`, not the table's own internals.** Reaching for
        // `table._.columns` reads `undefined` and every insert then carries
        // no columns at all - the shape is not part of Drizzle's contract.
        const columns = new Set(Object.keys(getTableColumns(table)))
        for (const one of incoming as Record<string, unknown>[]) {
          const values: Record<string, unknown> = { caseId, createdBy: actorId, updatedBy: actorId }
          for (const [key, value] of Object.entries(one)) {
            if (NEVER_CARRIED.has(key) || !columns.has(key)) continue
            values[key] = REFERENCE_FIELD_NAMES.has(key) ? remapped(value, remap) : value
          }
          // A timestamp arrives as an ISO string and the column wants a Date.
          for (const key of Object.keys(values)) {
            if (/At$|^time$/.test(key) && typeof values[key] === 'string') {
              const when = new Date(values[key])
              values[key] = Number.isNaN(when.getTime()) ? null : when
            }
          }

          if (name === 'evidence') {
            const hash = typeof one.hash === 'string' ? one.hash : ''
            // **The row keeps its digest either way.** With the bytes it
            // resolves; without them it is a record of evidence held
            // elsewhere, which this app already has a shape for.
            if (hash && !held.has(hash)) {
              missingFiles += 1
              values.storedAt = null
            }
          }
          if (name === 'reports') values.document = null

          const [written] = (await tx
            .insert(table)
            .values(values as never)
            .returning()) as { id?: string }[]
          if (typeof one.id === 'string' && written?.id) remap.set(one.id, written.id)
          rows += 1
        }
      }

      // **The prose is written after the reports exist**, keyed to the new
      // report ids - the document's fragments are keyed by *block* id and
      // those were remapped too, so a document copied under the old report's
      // name would be filed where nothing reads it.
      for (const [name, bytes] of Object.entries(members)) {
        if (!name.startsWith(PROSE_PREFIX)) continue
        const oldId = name.slice(PROSE_PREFIX.length).replace(/\.ydoc$/, '')
        const fresh = remap.get(oldId)
        if (!fresh) {
          this.log.warn(`archive carries prose for report ${oldId}, which it does not describe`)
          continue
        }
        await tx
          .update(reports)
          .set({ document: Buffer.from(bytes) })
          .where(sql`${reports.id} = ${fresh}`)
      }

      this.log.log(`imported ${String(rows)} rows as case ${caseId}`)
      return { id: caseId, title: String(record.title), rows, attachments, missingFiles }
    })
  }

  private async unsealed(archive: Buffer, passphrase: string): Promise<Buffer> {
    if (!isSealed(archive)) {
      if (passphrase) {
        // Saying so beats ignoring it: an analyst who typed one believes the
        // archive is encrypted, and silently importing a plain one leaves that
        // belief in place about every copy of it.
        throw new UnprocessableEntityException({
          message: 'This archive is not encrypted, so it needs no passphrase.',
        })
      }
      return archive
    }
    if (!passphrase) {
      throw new UnprocessableEntityException({
        message: 'This archive is encrypted. Enter its passphrase to import it.',
      })
    }
    try {
      return await open(archive, passphrase)
    } catch (error) {
      if (error instanceof WrongPassphrase || error instanceof MalformedEnvelope) {
        throw new UnprocessableEntityException({ message: error.message })
      }
      throw error
    }
  }
}
