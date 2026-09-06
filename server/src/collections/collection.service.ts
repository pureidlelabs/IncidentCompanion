/**
 * One implementation of every entity collection's reads and writes: rows
 * belonging to a case, written under a version check, announced on a change
 * feed, attributed to the caller.
 *
 * **What is *not* generic lives in the schema**, which is where a collection
 * says what a row is. Nothing here knows a timeline has a severity.
 *
 * **Every single-row update goes through `updateVersioned`**, so attribution,
 * the version check and the feed row stay one operation. A collection that
 * grows its own update path lands writes unowned, unversioned and invisible to
 * every other analyst's open screen.
 */
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common'
import { and, asc, eq, getTableColumns, inArray, sql } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import type { z } from 'zod'

import { isScope } from '../domain/scopes.lists.js'
import type { CollectionName, Scope } from '../domain/wire.js'

import { columnOf } from '../db/column-access.js'
import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { changeFeed } from '../db/schema/index.js'
import { updateVersioned, type WriteResult } from '../db/mutate.js'
import { withCase } from '../db/scope.js'
import type { Transaction } from '../db/client.js'
import { COLLECTION_SCHEMAS } from '../domain/collections.js'
import { hasCrossFieldRule } from '../domain/field-spec.js'
import { danglingReferences, refusalFor } from './reference-check.js'
import { TABLES, type BulkTarget } from './registry.js'
import { CaseChannel } from '../live/case-channel.service.js'
import type { ClosedRowGuard } from '../report/freeze.js'

/** The selection, grouped so each table is one `DELETE`. */
function groupByCollection(
  targets: { collection: BulkTarget; id: string }[],
): [BulkTarget, string[]][] {
  const grouped = new Map<BulkTarget, string[]>()
  for (const { collection, id } of targets) {
    grouped.set(collection, [...(grouped.get(collection) ?? []), id])
  }
  return [...grouped]
}

/** Rows per INSERT statement, bounded by Postgres's 65,535 bound parameters. */
const INSERT_CHUNK = 1000


/** What a collection has to declare to be served. */
export interface CollectionDefinition {
  /**
   * The name in the URL and on the change feed.
   *
   * **Typed as the vocabulary rather than as `string`**, because those two
   * uses are the same set: a definition whose name is not a collection route
   * announces a scope the client turns into a key nothing reads. A wrong
   * spelling is a compile error here rather than a screen that quietly stops
   * refreshing. -> `domain/wire.ts`
   */
  readonly name: CollectionName
  readonly table: PgTable
  /** The column rows are ordered by. The timeline's is its time, not its id. */
  readonly orderBy: string
  /**
   * The column a manual order is written to, for the collections that have
   * one. Absent means the collection cannot be reordered.
   *
   * **Separate from `orderBy`, and that separation is the whole point.**
   * `orderBy` is how rows come back and every collection has one, nearly all of
   * them inheriting `createdAt` from `ordered()`. Deriving orderability from it
   * mounts a reorder on all of them, and a guard asking whether
   * `columnOf(def.table, def.orderBy)` is undefined cannot refuse them --
   * `columnOf` returns a column or throws. What that reaches is
   * `set({ createdAt: 0 })` on a timestamp column.
   */
  readonly position?: string
  /**
   * The column an order is scoped *within*, where one exists.
   *
   * `report_blocks` are ordered inside their own report, so "every row, once
   * each" is a claim about that report and not about the case's blocks as a
   * whole. Absent means the collection is its own scope.
   */
  readonly orderWithin?: string
  /**
   * Which schema a row validates against, for the reference check.
   *
   * **Only the timeline needs to supply this.** Every other collection has one
   * schema and `COLLECTION_SCHEMAS` already holds it; the timeline's depends
   * on the row's `kind`, and that knowledge belongs in its own controller
   * rather than as a special case in here.
   */
  readonly schemaFor?: (values: Record<string, unknown>) => z.ZodObject | undefined
  /**
   * Refuse a write that lands in a row this collection considers closed. Only
   * the report tier has such a state, and each of the five write methods below
   * calls it once.
   *
   * Those five are not every write path in the server. One outside this class
   * asks `freezeGuardFor` instead. -> `report/freeze.ts`
   */
  readonly refuseIfClosed?: ClosedRowGuard
}

@Injectable()
export class CollectionService {
  private readonly log = new Logger(CollectionService.name)

  /**
   * The channel is optional for the tests, which build this service by hand
   * against a pool. Nest always injects it.
   */
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Optional() private readonly channel?: CaseChannel,
  ) {}

  /** Tell every screen open on this case which tables moved. */
  private announce(caseId: string, scopes: readonly Scope[], by: string): void {
    this.channel?.announce(caseId, scopes, by)
  }

  /**
   * Refuse a write to a row another analyst has open, with 409 and the
   * holder's name.
   *
   * **Not a lock, and no substitute for the version check.** A lost connection
   * frees the row and the next analyst writes legitimately; what catches the
   * first analyst's later save is the version. A caller with no socket - the
   * API door - holds no claim at all.
   *
   * Compared by `userId`: a display name is not unique, and the holder writing
   * to their own row is the normal case. -> `live/case-channel.service.ts`
   */
  private async refuseIfHeldByAnother(
    caseId: string,
    entity: string,
    id: string,
    actorId: string,
  ): Promise<void> {
    /**
     * **A store that cannot answer means nobody is known to hold this.** The
     * claim is advisory, and the live layer is the one dependency this write
     * does not need: refusing here turns a Redis outage into a 500 on every
     * row edit, before the write, so the analyst loses the edit and is told
     * nothing. The announce one layer along already takes this view -- *a
     * missed repaint is the right failure* -- and the guard that matters is
     * the version check, which is in Postgres and unaffected. -> #173
     */
    const holder = await this.channel?.holderOf(caseId, entity, id).catch((error: unknown) => {
      // **Logged rather than swallowed.** A guard that stops working with no
      // signal is the failure this codebase keeps finding elsewhere; the
      // catch is deliberately broad, so a parse fault in `claims()` would
      // otherwise read as "nobody holds this" for ever, silently.
      this.log.warn(`could not read who holds ${entity} ${id}: ${String(error)}`)
      return null
    })
    if (holder && holder.userId !== actorId) {
      throw new ConflictException({
        message: `${holder.username} has this open.`,
        heldBy: holder.username,
      })
    }
  }

  /**
   * The handle, for the callers that query across collections rather than
   * within one: `bulk-delete` counting references over every table before it
   * deletes anything, and `exports`. Neither is a *collection* operation, and
   * expressing either through a definition would need one per table.
   *
   * **Exposed rather than reimplemented, and scoping is still the caller's** -
   * a query on this handle is outside `withCase` until it says otherwise.
   */
  get database(): Database {
    return this.db
  }

  /**
   * The four columns this service reaches for by name, resolved once and
   * eagerly - a table missing one is a schema defect, and failing here names
   * it. Named properties rather than a string index, so a typo is a compile
   * error. -> `db/column-access.ts`
   */
  private columns(def: CollectionDefinition) {
    return {
      id: columnOf(def.table, 'id'),
      caseId: columnOf(def.table, 'caseId'),
      version: columnOf(def.table, 'version'),
      order: columnOf(def.table, def.orderBy),
    }
  }

  /**
   * Refuse a write whose references point outside this case.
   *
   * **The database cannot do this one.** A foreign key is checked internally,
   * outside row-level security, so a row naming another case's system is
   * accepted and no policy ever sees it. -> `domain/references.ts`
   *
   * **Here rather than in each controller**, so a collection cannot be added
   * without it. Run inside the caller's transaction, which is already scoped -
   * that is what makes "does this id exist" mean "is it in this case".
   */
  private async refuseDanglingReferences(
    tx: Transaction,
    def: CollectionDefinition,
    values: Record<string, unknown>,
    /** 1-based, for a batch. Omitted for a single write, which has no row. */
    row?: number,
  ): Promise<void> {
    const schema = def.schemaFor?.(values) ?? COLLECTION_SCHEMAS[def.name]
    if (!schema) return

    const dangling = await danglingReferences(tx, schema, values)
    if (dangling.length > 0) {
      // 400 rather than 404: the request named something, and saying *which*
      // row is missing would answer whether it exists in a case the caller
      // cannot see.
      const said = refusalFor(dangling)
      throw new BadRequestException({
        message: row === undefined ? said : `row ${String(row)}: ${said}`,
      })
    }
  }

  /**
   * Drop the references that name a row outside this case, and say whether any
   * did. Mutates the row.
   *
   * **A multi-valued reference keeps the ids that resolve.** `evidenceIds` is a
   * list, and nulling the field for one foreign id would discard the four that
   * were fine -- silently, since the caller counts the row once either way.
   * Worse, the column is `NOT NULL` with a `[]` default: Drizzle binds a
   * present `null` rather than falling back to the default, so the write dies
   * on a not-null violation and takes the whole transaction with it. Filtering
   * is the only shape that is right for both kinds.
   *
   * Returns 1 or 0 rather than a field count: an analyst reading "3 references
   * dropped" is asking how many of their lines came across less connected, and
   * a row losing two links is still one line.
   */
  private async dropForeignReferences(
    tx: Transaction,
    def: CollectionDefinition,
    values: Record<string, unknown>,
  ): Promise<number> {
    const schema = def.schemaFor?.(values) ?? COLLECTION_SCHEMAS[def.name]
    if (!schema) return 0

    const dangling = await danglingReferences(tx, schema, values)
    if (dangling.length === 0) return 0

    for (const { field, ids } of dangling) {
      const current = values[field]
      values[field] = Array.isArray(current)
        ? current.filter((one) => !ids.includes(one as string))
        : null
    }
    return 1
  }

  /**
   * Refuse a patch whose *result* breaks a rule spanning two fields.
   *
   * **One schema carries a cross-field rule**, and it is the reason this
   * exists: `network_indicators` refuses a `scope` on anything that is not an
   * address. A patch setting `type: 'domain'` on a scoped row is legal on its
   * own and wrong for the row it leaves behind, which is the case the merge
   * answers and the patch body cannot.
   *
   * **A cross-field rule cannot be answered from the patch body.** Clearing
   * `ip` sends no `domain`, so the rule reads `undefined` and passes; the row
   * it leaves behind is the only thing that can be judged. `patchSchema()`
   * rebuilds from `.shape` and object-level checks are not in a shape, so
   * nothing downstream carries them either.
   *
   * **Only for a schema that has such a rule**, detected rather than listed:
   * a `.refine()` in Zod 4 leaves the object a `ZodObject` and appends to
   * `_zod.def.checks`, so a collection without one pays no read.
   *
   * **A stale caller is somebody else's problem, not this check's.** This runs
   * ahead of `updateVersioned` and in a different transaction, so the row it
   * reads is current disk rather than the base the caller read. Judging their
   * patch against it is the refresh-before-write the design refuses: A reads
   * v1, B clears `domain`, A clears `ip` - and A would be told the indicator
   * needs one of the two, when what A is owed is the 409 merge review naming
   * the field they both set. So when the version has moved, this stands aside
   * and lets the version check answer.
   *
   * `updateMany` carries a version per row and passes it here for the same
   * reason, so a bulk patch and a single one answer a moved row alike.
   */
  private async refuseIfCrossFieldRuleBroken(
    tx: Transaction,
    def: CollectionDefinition,
    id: string,
    patch: Record<string, unknown>,
    expectedVersion?: number,
  ): Promise<void> {
    const schema = def.schemaFor?.(patch) ?? COLLECTION_SCHEMAS[def.name]
    if (!schema || !hasCrossFieldRule(schema)) return

    const [stored] = (await tx
      .select()
      .from(def.table)
      .where(eq(columnOf(def.table, 'id'), id))
      .limit(1)) as Record<string, unknown>[]
    if (!stored) return
    if (expectedVersion !== undefined && stored['version'] !== expectedVersion) return

    // **The stored half comes out of Drizzle, the patch half off the wire, and
    // they spell a time differently.** A `timestamp` column reads back as a
    // `Date`; the schemas declare `z.iso.datetime()`, a string. Parsing the
    // merge without this refuses a patch that never touched the time, and only
    // on rows where the timestamp is set -- which is why it survived the first
    // two tests here.
    //
    // **On the value, not the column type**, so a `date()` column in date mode
    // is caught as well -- a `columnType.startsWith('PgTimestamp')` predicate,
    // which is what `coerceTimes` uses, would let one through.
    //
    // The open half: a field declared `z.iso.date()` would be handed a full
    // datetime and reject it. No schema has one today; add the date-only
    // spelling here when the first does.
    const wire = Object.fromEntries(
      Object.entries(stored).map(([key, value]) =>
        [key, value instanceof Date ? value.toISOString() : value]),
    )

    const merged = schema.safeParse({ ...wire, ...patch })
    if (!merged.success) {
      throw new BadRequestException({ message: merged.error.issues[0]?.message ?? 'Invalid' })
    }
  }

  /**
   * A selection spanning collections, removed as one write.
   *
   * **No `refuseIfClosed`, because reports are not reachable from here.**
   * `TABLES` is the bulk half of the registry and has never held `reports` or
   * `report_blocks`, so a selection cannot name one.
   * -> `collections/registry.ts`
   *
   * **No version check**, matching the client's contract, which sends ids
   * only. The reference check in front of this is the guard that matters here.
   */
  async removeMany(
    caseId: string,
    targets: { collection: BulkTarget; id: string }[],
    actorId: string,
  ): Promise<{
    deleted: { collection: string; id: string }[]
    missing: { collection: string; id: string }[]
  }> {
    const outcome = await withCase(this.db, caseId, async (tx) => {
      const deleted: { collection: string; id: string }[] = []

      for (const [collection, ids] of groupByCollection(targets)) {
        const table = TABLES[collection]
        const id = columnOf(table, 'id')
        const gone = (await tx
          .delete(table)
          .where(and(inArray(id, ids), eq(columnOf(table, 'caseId'), caseId)))
          .returning({ id })) as { id: string }[]

        for (const row of gone) deleted.push({ collection, id: row.id })

        if (gone.length > 0) {
          await tx.insert(changeFeed).values(
            gone.map((row) => ({
              caseId,
              entity: collection,
              entityId: row.id,
              op: 'delete' as const,
              version: 0,
              actorId,
              fields: [],
            })),
          )
        }
      }

      const removed = new Set(deleted.map((row) => `${row.collection}:${row.id}`))
      return {
        deleted,
        // Reported rather than dropped: an id that matched nothing is either
        // already gone or belongs to another case, and both are worth the
        // caller knowing before it tells the analyst everything was removed.
        missing: targets
          .filter((t) => !removed.has(`${t.collection}:${t.id}`))
          .map((t) => ({ collection: t.collection, id: t.id })),
      }
    })

    // Filtered rather than cast: `collection` here came back from a delete
    // across tables, so it is a value the database produced.
    const moved = [...new Set(outcome.deleted.map((row) => row.collection))].filter(isScope)
    if (moved.length > 0) this.announce(caseId, moved, actorId)
    return outcome
  }

  /**
   * ISO strings become `Date`s for the columns that are timestamps.
   *
   * **Derived from the table, never from the field name.** Every time arrives
   * as a string, because a schema is also the API document and JSON Schema has
   * no date type - and the columns carrying one share no naming rule.
   */
  private coerceTimes(
    def: CollectionDefinition,
    values: Record<string, unknown>,
  ): Record<string, unknown> {
    const columns = getTableColumns(def.table)
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(values)) {
      const column = columns[key]
      // `columnType`, not `dataType`: a timestamp's `dataType` is
      // `'object date'`, so an `=== 'date'` test matches nothing.
      const isTimestamp = column?.columnType?.startsWith('PgTimestamp') ?? false
      out[key] = isTimestamp && typeof value === 'string' ? new Date(value) : value
    }
    return out
  }

  /**
   * Every row of this collection in the case, in the definition's order.
   *
   * The `caseId` clause is what makes the query use the index, not what makes
   * it safe - row-level security already refuses every row outside the scope.
   */
  list(def: CollectionDefinition, caseId: string): Promise<unknown[]> {
    const cols = this.columns(def)
    return withCase(this.db, caseId, (tx) =>
      tx
        .select()
        .from(def.table)
        .where(eq(cols.caseId, caseId))
        .orderBy(asc(cols.order)),
    )
  }

  /**
   * One row, with the caller as its author.
   *
   * **The insert and its feed row are one transaction** - a row that exists
   * and was never announced is invisible to every screen already open.
   */
  async create(
    def: CollectionDefinition,
    caseId: string,
    values: Record<string, unknown>,
    actorId: string,
  ): Promise<unknown> {
    await def.refuseIfClosed?.(this.db, caseId, { rows: [values] })

    const written = await withCase(this.db, caseId, async (tx) => {
      await this.refuseDanglingReferences(tx, def, values)

      const [row] = (await tx
        .insert(def.table)
        .values({ ...this.coerceTimes(def, values), caseId, createdBy: actorId, updatedBy: actorId })
        .returning()) as { id: string; version: number }[]

      await tx.insert(changeFeed).values({
        caseId,
        entity: def.name,
        entityId: row!.id,
        op: 'insert',
        version: row!.version,
        actorId,
        fields: Object.keys(values),
      })
      return row
    })

    this.announce(caseId, [def.name], actorId)
    return written
  }

  /**
   * Many rows, as one write: one transaction for the rows and their feed
   * entries alike, so a CSV import failing on row 400 leaves nothing behind.
   *
   * Chunked at `INSERT_CHUNK`, inside that one transaction. A feed row per
   * entity, never one per batch.
   *
   * **`onForeignReference` is here rather than in the importer, because this is
   * where a row enters a case.** A file exported from one case and imported
   * into another names the source case's rows, and there are two import doors:
   * the API's `POST .../{collection}.csv` and the browser, which parses the
   * file itself and posts the array straight to `/bulk`. A rule stated in
   * `ImportService` reaches the first and not the second, so the two doors
   * disagreed and the analyst-facing one kept refusing whole files.
   *
   * `refuse` is the default and is what every ordinary write wants: a caller
   * naming a row in another case has made a mistake worth hearing about.
   * `drop` is for importing a file, where the link is meaningless in the
   * destination and the row is not -- which is what the column itself does when
   * its target goes. -> `db/schema/entities.ts`, `set null`
   */
  async createMany(
    def: CollectionDefinition,
    caseId: string,
    rows: Record<string, unknown>[],
    actorId: string,
    onForeignReference: 'refuse' | 'drop' = 'refuse',
  ): Promise<{ ids: string[]; unlinked: number }> {
    if (rows.length === 0) return { ids: [], unlinked: 0 }
    await def.refuseIfClosed?.(this.db, caseId, { rows })

    let unlinked = 0
    const ids = await withCase(this.db, caseId, async (tx) => {
      const written = await this.insertWithin(tx, def, caseId, rows, actorId, onForeignReference)
      unlinked += written.unlinked
      return written.ids
    })

    this.announce(caseId, [def.name], actorId)
    return { ids, unlinked }
  }


  /**
   * Insert one collection's rows on a transaction somebody else opened.
   *
   * **Extracted so a write can span collections.** `createMany` opens its own
   * `withCase`, which is right for one collection and wrong for an import: an
   * incident becomes rows in five tables and a timeline, and five transactions
   * can leave three of them committed when the fourth refuses.
   * -> `createAcross`
   */
  private async insertWithin(
    tx: Parameters<Parameters<typeof withCase>[2]>[0],
    def: CollectionDefinition,
    caseId: string,
    rows: Record<string, unknown>[],
    actorId: string,
    onForeignReference: 'refuse' | 'drop' = 'refuse',
  ): Promise<{ ids: string[]; unlinked: number }> {
    let unlinked = 0
      // Every row, not the first: a batch is all or nothing, so one bad
      // reference must refuse the whole call before any chunk is inserted.
      for (const [at, row] of rows.entries()) {
        if (onForeignReference === 'drop') {
          unlinked += await this.dropForeignReferences(tx, def, row)
          continue
        }
        // **Named by row, 1-based.** The CSV import highlights the offending
        // preview row by parsing `row <n>: ` off the message, and a batch is
        // where that matters -- a refusal with no row leaves the analyst a
        // whole file to search. -> `ui/src/components/blocks/csv-import.ts`
        await this.refuseDanglingReferences(tx, def, row, at + 1)
      }

      const inserted: { id: string; version: number }[] = []
      for (let at = 0; at < rows.length; at += INSERT_CHUNK) {
        const batch = (await tx
          .insert(def.table)
          .values(
            rows.slice(at, at + INSERT_CHUNK).map((row) => ({
              ...this.coerceTimes(def, row),
              caseId,
              createdBy: actorId,
              updatedBy: actorId,
            })) as never,
          )
          .returning()) as { id: string; version: number }[]
        inserted.push(...batch)
      }

      for (let at = 0; at < inserted.length; at += INSERT_CHUNK) {
        await tx.insert(changeFeed).values(
          inserted.slice(at, at + INSERT_CHUNK).map((row, within) => ({
            caseId,
            entity: def.name,
            entityId: row.id,
            op: 'insert' as const,
            version: row.version,
            actorId,
            fields: Object.keys(rows[at + within] ?? {}),
          })),
        )
      }
      return { ids: inserted.map((row) => row.id), unlinked }
  }

  /**
   * Rows across several collections, in one transaction.
   *
   * **What an import needs and `createMany` cannot give it.** Every group is
   * checked and inserted on the same handle, so a refusal anywhere leaves the
   * case exactly as it was -- and every guard `createMany` applies applies
   * here, because it is the same code: the reference check per row, the
   * attribution, the change-feed row per insert.
   */
  async createAcross(
    caseId: string,
    actorId: string,
    groups: { def: CollectionDefinition; rows: Record<string, unknown>[] }[],
    onForeignReference: 'refuse' | 'drop' = 'refuse',
  ): Promise<{ ids: Record<string, string[]>; unlinked: number }> {
    const wanted = groups.filter((group) => group.rows.length > 0)
    if (wanted.length === 0) return { ids: {}, unlinked: 0 }
    for (const group of wanted) {
      await group.def.refuseIfClosed?.(this.db, caseId, { rows: group.rows })
    }

    let unlinked = 0
    const ids = await withCase(this.db, caseId, async (tx) => {
      const written: Record<string, string[]> = {}
      for (const group of wanted) {
        const one = await this.insertWithin(
          tx, group.def, caseId, group.rows, actorId, onForeignReference,
        )
        written[group.def.name] = one.ids
        unlinked += one.unlinked
      }
      return written
    })

    this.announce(caseId, wanted.map((group) => group.def.name), actorId)
    return { ids, unlinked }
  }

  /**
   * Renumber a collection's `orderBy` column to the order the caller sent.
   *
   * **A reorder is a bulk write, and states its own version contract**: the
   * caller named every row, so the list *is* the intent and there is no
   * per-row version to check against. This is where it parts from
   * `updateMany`, which patches a selection out of a longer collection and so
   * carries the version each row was read at. What a reorder keeps is what
   * every bulk write keeps - the freeze, the case boundary, attribution, and
   * one change-feed row per row that moved.
   *
   * **The whole collection or nothing.** A partial list means somebody added a
   * row while this screen was open, and applying it would interleave two orders
   * into one neither analyst chose. The refusal is the useful answer, which is
   * what `useEntryReorder` already tells the analyst.
   *
   * **Only rows that actually moved reach the feed.** Renumbering every row on
   * every reorder would repaint every other analyst's screen for rows that did
   * not change.
   */
  async reorder(
    def: CollectionDefinition,
    caseId: string,
    ids: string[],
    actorId: string,
  ): Promise<{ ids: string[] }> {
    // **Declared, not derived.** Every collection has an `orderBy`, so asking
    // the table settles nothing; only a collection that names a `position`
    // column has somewhere to record an order an analyst chose.
    if (!def.position) {
      throw new UnprocessableEntityException({
        message: `${def.name} rows carry no order an analyst sets.`,
      })
    }
    const cols = this.columns(def)
    const order = columnOf(def.table, def.position)
    await def.refuseIfClosed?.(this.db, caseId, { ids, rows: [] })

    const result = await withCase(this.db, caseId, async (tx) => {
      const scope = def.orderWithin ? columnOf(def.table, def.orderWithin) : undefined

      // The named rows first, so the scope can be read off them rather than
      // taken from the caller - a caller that could name the scope could
      // reorder a report it never opened.
      const named = new Set(ids)
      if (named.size !== ids.length) {
        throw new UnprocessableEntityException({
          message: 'A reorder names each row once.',
        })
      }
      const rows = ids.length
        ? ((await tx
            .select({ id: cols.id, position: order, ...(scope ? { scope } : {}) })
            .from(def.table)
            .where(inArray(cols.id, ids))) as {
            id: string
            position: number
            scope?: unknown
          }[])
        : []
      const present = new Set(rows.map((row) => row.id))
      const strangers = ids.filter((id) => !present.has(id))
      if (strangers.length > 0) {
        throw new UnprocessableEntityException({
          message: `No such row in this case: ${strangers.join(', ')}.`,
        })
      }
      // `JSON.stringify`, not `String`: `scope` is whatever column
      // `orderWithin` names, and a non-primitive one would collapse every row
      // to `[object Object]` and read as a single scope.
      const scopes = new Set(rows.map((row) => JSON.stringify(row.scope ?? '')))
      if (scopes.size > 1) {
        throw new UnprocessableEntityException({
          message: `A reorder names rows from one ${def.orderWithin ?? 'collection'} at a time.`,
        })
      }

      // The whole of that scope, once each: a partial list means somebody added
      // a row while this screen was open.
      const current = (await tx
        .select({ id: cols.id, position: order })
        .from(def.table)
        .where(scope && rows[0] ? eq(scope, rows[0].scope as never) : undefined)
        .orderBy(asc(order))) as { id: string; position: number }[]
      if (current.length !== ids.length) {
        throw new UnprocessableEntityException({
          message: `A reorder names every row in the ${def.orderWithin ?? 'collection'}, once each.`,
        })
      }

      const was = new Map(current.map((row) => [row.id, row.position]))
      const moved: { id: string; version: number }[] = []
      for (const [at, id] of ids.entries()) {
        if (was.get(id) === at) continue
        const [row] = (await tx
          .update(def.table)
          .set({
            [def.orderBy]: at,
            updatedBy: actorId,
            updatedAt: new Date(),
            version: sql`${cols.version} + 1`,
          })
          .where(and(eq(cols.id, id), eq(cols.caseId, caseId)))
          .returning()) as { id: string; version: number }[]
        if (row) moved.push(row)
      }

      if (moved.length > 0) {
        await tx.insert(changeFeed).values(
          moved.map((row) => ({
            caseId,
            entity: def.name,
            entityId: row.id,
            op: 'update' as const,
            version: row.version,
            actorId,
            fields: [def.orderBy],
          })),
        )
      }
      return { ids, moved: moved.length }
    })

    if (result.moved > 0) this.announce(caseId, [def.name], actorId)
    return { ids: result.ids }
  }

  /**
   * One set of fields, applied to many rows, each named with the version it
   * was read at.
   *
   * **The version check is per row, not per batch**, because the requirement
   * asks that the outcome for every row be determinable: a row somebody else
   * moved is `refused` while its neighbours go through, and an analyst told
   * only that three of five landed still does not know which two to look at.
   *
   * **Three answers, and they are not interchangeable.** `missing` is a row
   * this case does not have -- the `where` is scoped by `caseId`, so an id
   * from elsewhere matches nothing. `refused` is a row that exists and has
   * moved since the caller read it. An analyst handed the wrong one of those
   * looks in the wrong place.
   *
   * Every id given comes back in exactly one of the three.
   */
  async updateMany(
    def: CollectionDefinition,
    caseId: string,
    rows: { id: string; version: number }[],
    fields: Record<string, unknown>,
    actorId: string,
  ): Promise<{ updated: string[]; missing: string[]; refused: string[] }> {
    if (rows.length === 0) return { updated: [], missing: [], refused: [] }
    const ids = rows.map((row) => row.id)
    await def.refuseIfClosed?.(this.db, caseId, { ids, rows: [fields] })
    const cols = this.columns(def)

    const result = await withCase(this.db, caseId, async (tx) => {
      // One patch reaches every named row, so the reference is checked once.
      await this.refuseDanglingReferences(tx, def, fields)

      // A cross-field rule is a property of each *result*, so it is checked
      // per row rather than once -- two rows can differ in the half the patch
      // does not name.
      //
      // **The version goes with it, so a moved row is answered by the version
      // check rather than by this one.** Without it the two doors give two
      // answers for the same act.
      for (const row of rows) {
        await this.refuseIfCrossFieldRuleBroken(tx, def, row.id, fields, row.version)
      }

      // **The version travels in the statement, not in a read before it**,
      // which would leave open the window this check exists to close.
      const pairs = rows.map((row) => sql`(${row.id}::uuid, ${row.version})`)
      const updated = (await tx
        .update(def.table)
        .set({
          ...this.coerceTimes(def, fields),
          updatedBy: actorId,
          updatedAt: new Date(),
          version: sql`${cols.version} + 1`,
        })
        .where(
          and(
            eq(cols.caseId, caseId),
            sql`(${cols.id}, ${cols.version}) IN (${sql.join(pairs, sql`, `)})`,
          ),
        )
        .returning()) as { id: string; version: number }[]

      if (updated.length > 0) {
        await tx.insert(changeFeed).values(
          updated.map((row) => ({
            caseId,
            entity: def.name,
            entityId: row.id,
            op: 'update' as const,
            version: row.version,
            actorId,
            fields: Object.keys(fields),
          })),
        )
      }

      const touched = new Set(updated.map((row) => row.id))
      const rest = ids.filter((id) => !touched.has(id))

      // **What did not take splits two ways.** A row this case holds was
      // refused because it moved; one it does not hold is missing. Asked once,
      // for the remainder only.
      const here = rest.length
        ? new Set(
            (
              (await tx
                .select({ id: cols.id })
                .from(def.table)
                .where(and(inArray(cols.id, rest), eq(cols.caseId, caseId)))) as { id: string }[]
            ).map((row) => row.id),
          )
        : new Set<string>()

      return {
        updated: [...touched],
        refused: rest.filter((id) => here.has(id)),
        missing: rest.filter((id) => !here.has(id)),
      }
    })

    if (result.updated.length > 0) this.announce(caseId, [def.name], actorId)
    return result
  }

  /**
   * A patch under the version the caller read.
   *
   * **`expectedVersion` is what they read, never a value fetched here.**
   * Refreshing first adopts the other analyst's value as the base, and the
   * check then passes on a save that should have been a question.
   */
  async update(
    def: CollectionDefinition,
    caseId: string,
    id: string,
    expectedVersion: number,
    patch: Record<string, unknown>,
    actorId: string,
  ): Promise<WriteResult<{ id: string; version: number }>> {
    // **The patch as well as the row.** A patch may name a *different* parent -
    // moving a block into a sent report is a write to that report.
    await def.refuseIfClosed?.(this.db, caseId, { ids: [id], rows: [patch] })
    await this.refuseIfHeldByAnother(caseId, def.name, id, actorId)

    /**
     * **Checked in its own scoped transaction, ahead of the write.**
     * `updateVersioned` opens its own, so there is no shared one to run this
     * inside. The gap that leaves is benign: a referenced row deleted between
     * the check and the write leaves the reference null by its own `set null`,
     * which is the same outcome as never naming it.
     */
    await withCase(this.db, caseId, async (tx) => {
      await this.refuseDanglingReferences(tx, def, patch)
      await this.refuseIfCrossFieldRuleBroken(tx, def, id, patch, expectedVersion)
    })

    const result = await updateVersioned<{ id: string; version: number }>(this.db, {
      table: def.table,
      entity: def.name,
      caseId,
      id,
      expectedVersion,
      actorId,
      patch: this.coerceTimes(def, patch),
    })

    // Only an accepted write moved anything; a refusal is the caller's problem
    // and nobody else's screen changed.
    if (result.ok) this.announce(caseId, [def.name], actorId)
    return result
  }

  /**
   * **Deletes are version-checked too.** Removing a row another analyst has
   * just edited is the same lost update as overwriting it, and the version is
   * the only thing that can tell.
   */
  async remove(
    def: CollectionDefinition,
    caseId: string,
    id: string,
    expectedVersion: number,
    actorId: string,
  ): Promise<boolean> {
    await def.refuseIfClosed?.(this.db, caseId, { ids: [id] })
    const cols = this.columns(def)
    const removed = await withCase(this.db, caseId, async (tx) => {
      const deleted = (await tx
        .delete(def.table)
        .where(
          and(
            eq(cols.id, id),
            eq(cols.caseId, caseId),
            eq(cols.version, expectedVersion),
          ),
        )
        .returning({ id: cols.id })) as { id: string }[]

      if (deleted.length === 0) return false

      await tx.insert(changeFeed).values({
        caseId,
        entity: def.name,
        entityId: id,
        op: 'delete',
        version: expectedVersion,
        actorId,
        fields: [],
      })
      return true
    })

    if (removed) this.announce(caseId, [def.name], actorId)
    return removed
  }

  async get(def: CollectionDefinition, caseId: string, id: string): Promise<unknown> {
    const cols = this.columns(def)
    const [row] = await withCase(this.db, caseId, (tx) =>
      tx
        .select()
        .from(def.table)
        .where(and(eq(cols.id, id), eq(cols.caseId, caseId))),
    )
    if (!row) throw new NotFoundException(`No ${def.name} ${id} in that case.`)
    return row
  }
}
