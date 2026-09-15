/**
 * A `.iccase`, in - as a **new case**, never as a restore over an old one.
 *
 * Every row is created fresh: new ids throughout with the references between
 * rows remapped, versions restarting at 1, and attribution naming whoever
 * imported it. Evidence rows keep their digests, so a handover archive
 * imports rows whose files are absent.
 */
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common'
import { and, eq, getTableColumns, sql } from 'drizzle-orm'

import { defaultCustomer } from '../customers/customers.service.js'
import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { EvidenceStore } from '../evidence/store.js'
import { BadArchive, CASE_NAME, EVIDENCE_PREFIX, PROSE_PREFIX, readArchive } from '../archive/format.js'
import { MalformedEnvelope, WrongPassphrase, isSealed, open } from '../archive/envelope.js'
import { PolicyService } from '../policy/policy.service.js'
import { REFERENCE_FIELD_NAMES } from '../domain/collections.js'
import { importStamp } from '../db/import-stamp.js'
import { archiveRowSchema } from './rows.js'
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

/**
 * One archive row, judged by the shape its collection declares.
 *
 * Returns what survives: every field this build knows, with a field it does
 * not dropped, so an archive from another build of this application imports
 * what it has in common. Throws `BadArchive` naming the collection and the
 * field where a value this build knows carries something it cannot mean.
 */
function checked(collection: string, row: Record<string, unknown>): Record<string, unknown> {
  const schema = archiveRowSchema(collection, row)
  if (!schema) {
    // **A collection with no shape is refused, never waved through.** Waving
    // it through is what the loop did for every collection, which is the
    // defect -- and a timeline row naming neither kind is the live case.
    throw new BadArchive(`this archive's ${collection} rows are not ones this install can read`)
  }
  const seen = schema.safeParse(row)
  if (seen.success) {
    /**
     * **Only what the archive stated.** `.partial()` makes a field optional
     * and does not suppress its `.default()`, so parsing a row that omits a
     * column returns the *schema's* default for it -- which the loop would
     * then write as an explicit value, overriding the column's own. A cloud
     * app omitting `verifiedPublisher` would be stored `unknown` where the
     * column says `unverified`: nothing known, in place of a stated negative
     * finding, on exactly the other-build archive this is meant to serve.
     */
    const stated: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(seen.data)) {
      if (Object.hasOwn(row, key)) stated[key] = value
    }
    return stated
  }

  const first = seen.error.issues[0]
  const field = first?.path.join('.') ?? ''
  // **Named "in <collection>" rather than possessively.** A collection name is
  // plural and a possessive puts a singular verb after it, so every wording
  // that reads well for one reads wrong for the other.
  throw new BadArchive(
    `this archive states ${field ? `a ${field}` : 'a value'} in ${collection} that this install cannot read`,
  )
}

/**
 * What this door calls itself on a row that can record where it came from.
 *
 * -> `db/import-stamp.ts`
 */
export const ARCHIVE_IMPORT = 'Case archive'

/**
 * Columns an import never carries over, whatever the archive says.
 *
 * The identity and attribution of a row are this install's to mint, and where
 * the row came from is this door's to state -- an archive is truthful about
 * the install that wrote it, and every one of these answers about the install
 * reading it.
 */
const NEVER_CARRIED = new Set([
  'id',
  'caseId',
  'version',
  'createdAt',
  'updatedAt',
  'createdBy',
  'updatedBy',
  'source',
  'provenance',
  'unreviewed',
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
    private readonly policy: PolicyService,
  ) {}

  async load(archive: Buffer, passphrase: string, actorId: string): Promise<ImportResult> {
    const plain = await this.unsealed(archive, passphrase)
    const stored_ = await this.policy.read()
    const { members, attachments } = await readArchive(plain, {
      memberBytes: stored_['evidence.attachmentMegabytes'] * 1024 * 1024,
      totalBytes: stored_['evidence.archiveMegabytes'] * 1024 * 1024,
    })

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
        undefined,
        // The ceiling this import already read, rather than one read per
        // member: an archive may hold 10,000 of them.
        stored_['evidence.attachmentMegabytes'] * 1024 * 1024,
      )
      held.add(stored.hash)
    }

    return this.db.transaction(async (tx) => {
      // **Trimmed, as the three HTTP doors trim.** `createCaseSchema` and the
      // patch schema both `.trim()`, so an archive carrying ` INC-9 ` would
      // otherwise store a padded reference that collides with nothing and is
      // collided with by nothing -- one ticket, two cases, no refusal.
      const reference = typeof record.reference === 'string' ? record.reference.trim() : ''
      /**
       * **An import is a second case for one ticket, and is refused like a
       * create.** A reference is unique within its customer, so reading an
       * archive of a case this install still holds has to say which case
       * holds it rather than fail as a query -- the operator's way out is to
       * free the reference on one of them, and they cannot do that without
       * being told which.
       *
       * **Under the install's default customer, as `CasesService.create`
       * opens one.** The archive carries the free-text customer and nothing
       * resolves it to a record, so a read lands unattributed -- and the group
       * it is unique within has to be the same group the other door uses, or
       * one door admits what the other refuses.
       */
      const customerId = (await defaultCustomer(tx)).id
      if (reference) {
        const [held] = await tx
          .select({ title: cases.title })
          .from(cases)
          .where(and(eq(cases.reference, reference), eq(cases.customerId, customerId)))
          .limit(1)
        if (held) {
          throw new ConflictException({
            message:
              `"${held.title}" already carries ${reference}. ` +
              'Free that reference before reading this archive.',
          })
        }
      }

      const [made] = await tx
        .insert(cases)
        .values({
          title: String(record.title),
          reference,
          customerId,
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
          const values: Record<string, unknown> = {
            caseId,
            createdBy: actorId,
            updatedBy: actorId,
            ...importStamp(ARCHIVE_IMPORT, table),
          }
          // **Judged before it is written, not filtered by column name.** The
          // key was checked against the column list and the value against
          // nothing, so an archive reached typed columns with whatever it
          // liked -- a vocabulary no schema defines, an object where a
          // hostname goes, a number no column can hold. -> #625
          for (const [key, value] of Object.entries(checked(name, one))) {
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

          // **What only the database knows.** A column's range and length are
          // stated on the column; restating them in a schema makes a second
          // description that drifts from the one enforcing it. So a value the
          // schema admits and the column refuses arrives here, and is reported
          // as a refusal naming the collection rather than as a driver error
          // naming column names. -> #625
          let written: { id?: string } | undefined
          try {
            ;[written] = (await tx
              .insert(table)
              .values(values as never)
              .returning()) as { id?: string }[]
          } catch (error) {
            // **Logged, because the refusal names the archive and the store
            // may not be why.** A connection drop, a statement timeout or a
            // serialization failure reaches here too, and an operator told
            // their file is bad has nothing to act on and nothing to send on.
            this.log.warn(`${name} row refused by the store: ${String(error)}`)
            throw new BadArchive(
              `this archive states a value in ${name} that this install cannot write`,
            )
          }
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
