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
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'
import type { z } from 'zod'

import { isScope } from '../domain/scopes.lists.js'
import type { CollectionName, Scope } from '../domain/wire.js'

import { coerceTimes, columnOf } from '../db/column-access.js'
import { whenCommitted } from '../db/act.js'
import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { changeFeed } from '../db/schema/index.js'
import { updateVersioned, type WriteResult } from '../db/mutate.js'
import { nested, withCase, type Executor } from '../db/scope.js'
import { TABLES, type BulkTarget } from './registry.js'
import {
  columns,
  dropForeignReferences,
  refuseDanglingReferences,
  refuseIfCrossFieldRuleBroken,
} from './write-guards.js'
import { CaseChannel } from '../live/case-channel.service.js'
import { EvidenceStore } from '../evidence/store.js'
import { evidence } from '../db/schema/entities.js'
import { release } from '../report/artefacts-named.js'

/** The digest a deleted evidence row named, so the bytes can leave the case with it. */
const digestOf = (collection: string): Record<string, PgColumn> =>
  collection === 'evidence' ? { hash: columnOf(evidence, 'hash') } : {}

/** One row of a selection: which collection it is in, and what it was read at. */
interface BulkRow {
  collection: BulkTarget
  id: string
  version: number
}

function groupByCollection(targets: BulkRow[]): [BulkTarget, BulkRow[]][] {
  const grouped = new Map<BulkTarget, BulkRow[]>()
  for (const target of targets) {
    const rows = grouped.get(target.collection)
    if (rows) rows.push(target)
    else grouped.set(target.collection, [target])
  }
  return [...grouped]
}

/** Refuses a change naming a field the collection derives, with 422 naming it. */
function refuseDerived(def: CollectionDefinition, patch: Record<string, unknown>): void {
  const named = (def.derived ?? []).filter((field) => field in patch)
  if (named.length > 0) {
    throw new UnprocessableEntityException({
      message: `${named.join(', ')} follows the record's live document and is not written here.`,
      derived: named,
    })
  }
}

/** Rows per INSERT statement, bounded by Postgres's 65,535 bound parameters. */
const INSERT_CHUNK = 1000


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
  /** Which schema a row validates against for the reference check; absent, `COLLECTION_SCHEMAS`. */
  readonly schemaFor?: (values: Record<string, unknown>) => z.ZodObject | undefined
  /** Fields taken on create and written by nothing but their own writer afterwards. */
  readonly derived?: readonly string[]
  /** Refuses the values being written where one names a term the install does not serve. */
  readonly refuseUnservedTerm?: (db: Executor, rows: readonly Record<string, unknown>[]) => Promise<void>
}

@Injectable()
export class CollectionService {
  /**
   * The channel is optional for the tests, which build this service by hand
   * against a pool. Nest always injects it.
   */
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly store: EvidenceStore,
    @Optional() private readonly channel?: CaseChannel,
  ) {}

  /**
   * Tell the case's subscribers, once what they are being told is true.
   *
   * **Composed into a caller's act, this waits for that act's commit.**
   * `withCase` returning is a released savepoint rather than a commit, and
   * `case-channel.service.ts` requires that the write has landed: a subscriber
   * told here would read what is not there yet, or what a rollback is about to
   * remove. Announcing nothing instead was the older remedy and it made the
   * opposite failure -- an act that committed and told nobody. -> `db/act.ts`
   */
  private announce(caseId: string, scopes: readonly Scope[], by: string, on?: Executor): void {
    const tell = () => this.channel?.announce(caseId, scopes, by)
    // **Asked of the handle, not compared against ours.** `Executor` also holds
    // the seed pool, which is a second `Database`: a write on it opens and
    // commits its own transaction and is not composed, where an identity check
    // would call it composed and queue its announcement onto somebody's act.
    if (on === undefined || !nested(on)) tell()
    else whenCommitted(tell)
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
   * A selection spanning collections, removed as one write.
   *
   * **Every row carries the version it was read at, and one that moved since
   * is refused rather than deleted.** A selection is a read followed by a
   * write, so it has the window a single write closes with `?version=`; the
   * specification asks that acting in bulk carry every guarantee a single act
   * carries. -> #682, and #62/#65 on the bulk patch path.
   *
   * **One stale row refuses the whole selection**, with 409 and the rows that
   * moved, and nothing is written. Per row it would delete part of the
   * selection, and the reference check in front of this waves through a
   * reference whose holder is *in* the selection -- on the grounds that the
   * holder is about to go. A refusal that keeps the holder and drops its
   * target turns that reasoning into a blanked column nobody was told about,
   * because the keys are `on delete set null` by design.
   * -> `bulk-delete.service.ts`, and the specification: where speed and the
   * guarantees conflict, the guarantees win.
   */
  async removeMany(
    caseId: string,
    targets: BulkRow[],
    actorId: string,
  ): Promise<{
    deleted: { collection: string; id: string }[]
    missing: { collection: string; id: string }[]
  }> {
    const released: (string | null)[] = []
    const deleting = () => withCase(this.db, caseId, async (tx) => {
      const deleted: { collection: string; id: string }[] = []
      const refused: string[] = []

      for (const [collection, rows] of groupByCollection(targets)) {
        const table = TABLES[collection]
        const id = columnOf(table, 'id')
        const version = columnOf(table, 'version')

        // **The version travels in the statement, not in a read before it**,
        // which would leave open the window this check exists to close.
        const pairs = rows.map((row) => sql`(${row.id}::uuid, ${row.version})`)
        const gone = (await tx
          .delete(table)
          .where(
            and(
              eq(columnOf(table, 'caseId'), caseId),
              sql`(${id}, ${version}) IN (${sql.join(pairs, sql`, `)})`,
            ),
          )
          .returning({ id, version, ...digestOf(collection) })) as {
          id: string
          version: number
          hash?: string | null
        }[]

        for (const row of gone) {
          deleted.push({ collection, id: row.id })
          released.push(row.hash ?? null)
        }

        if (gone.length > 0) {
          await tx.insert(changeFeed).values(
            gone.map((row) => ({
              caseId,
              entity: collection,
              entityId: row.id,
              op: 'delete' as const,
              // The version the row held when it went, so a listener can tell
              // this delete from one that removed a different edit of the row.
              version: row.version,
              actorId,
              fields: [],
            })),
          )
        }

        // A named row that did not go is either still here under a version the
        // caller did not have, or not here at all. One read answers which.
        // **Distinct, because the caller may name an id twice** and a count of
        // refusals is what an analyst is shown.
        const removed = new Set(gone.map((row) => row.id))
        const rest = [...new Set(rows.filter((row) => !removed.has(row.id)).map((row) => row.id))]
        if (rest.length > 0) {
          const here = (await tx
            .select({ id })
            .from(table)
            .where(and(inArray(id, rest), eq(columnOf(table, 'caseId'), caseId)))) as {
            id: string
          }[]
          for (const one of here) refused.push(one.id)
        }
      }

      // **Thrown inside the transaction, so none of the deletes above stand.**
      // The single-row door answers a moved row this way and writes nothing.
      if (refused.length > 0) {
        const count = refused.length
        throw new ConflictException({
          message:
            count === 1
              ? 'One of those changed since you read it, so nothing was deleted.'
              : `${String(count)} of those changed since you read them, so nothing was deleted.`,
          refused,
        })
      }

      const answered = new Set(deleted.map((row) => `${row.collection}:${row.id}`))
      return {
        deleted,
        // Reported rather than dropped: an id that matched nothing is either
        // already gone or belongs to another case, and both are worth the
        // caller knowing before it tells the analyst everything was removed.
        missing: targets
          .filter((t) => !answered.has(`${t.collection}:${t.id}`))
          .map((t) => ({ collection: t.collection, id: t.id })),
      }
    })
    const outcome = await this.store.exclusive(caseId, async () => {
      const answer = await deleting()
      await release(this.db, this.store, caseId, released)
      return answer
    })

    // Filtered rather than cast: `collection` here came back from a delete
    // across tables, so it is a value the database produced.
    const moved = [...new Set(outcome.deleted.map((row) => row.collection))].filter(isScope)
    if (moved.length > 0) this.announce(caseId, moved, actorId)
    return outcome
  }

  /**
   * Every row of this collection in the case, in the definition's order.
   *
   * The `caseId` clause is what makes the query use the index, not what makes
   * it safe - row-level security already refuses every row outside the scope.
   */
  list(def: CollectionDefinition, caseId: string, on: Executor = this.db): Promise<unknown[]> {
    const cols = columns(def)
    return withCase(on, caseId, (tx) =>
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
    await def.refuseUnservedTerm?.(this.db, [values])

    const written = await withCase(this.db, caseId, async (tx) => {
      await refuseDanglingReferences(tx, def, values)

      const [row] = (await tx
        .insert(def.table)
        .values({ ...coerceTimes(def.table, values), caseId, createdBy: actorId, updatedBy: actorId })
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
    on: Executor = this.db,
  ): Promise<{ ids: string[]; unlinked: number }> {
    if (rows.length === 0) return { ids: [], unlinked: 0 }
    await def.refuseUnservedTerm?.(on, rows)

    let unlinked = 0
    const ids = await withCase(on, caseId, async (tx) => {
      const written = await this.insertWithin(tx, def, caseId, rows, actorId, onForeignReference)
      unlinked += written.unlinked
      return written.ids
    })

    this.announce(caseId, [def.name], actorId, on)
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
          unlinked += await dropForeignReferences(tx, def, row)
          continue
        }
        // **Named by row, 1-based**: a refusal naming no row leaves the
        // analyst a whole file to search.
        // -> `openspec/specs/data-exchange/spec.md`
        await refuseDanglingReferences(tx, def, row, at + 1)
      }

      const inserted: { id: string; version: number }[] = []
      for (let at = 0; at < rows.length; at += INSERT_CHUNK) {
        const batch = (await tx
          .insert(def.table)
          .values(
            rows.slice(at, at + INSERT_CHUNK).map((row) => ({
              ...coerceTimes(def.table, row),
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
    on: Executor = this.db,
  ): Promise<{ ids: Record<string, string[]>; unlinked: number }> {
    const wanted = groups.filter((group) => group.rows.length > 0)
    if (wanted.length === 0) return { ids: {}, unlinked: 0 }
    for (const group of wanted) {
      await group.def.refuseUnservedTerm?.(on, group.rows)
    }

    let unlinked = 0
    const ids = await withCase(on, caseId, async (tx) => {
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

    {
      this.announce(caseId, wanted.map((group) => group.def.name), actorId, on)
    }
    return { ids, unlinked }
  }

  /**
   * Renumber a collection's `orderBy` column to the order the caller sent.
   *
   * **A reorder is a bulk write, checked like one.** Every row carries the
   * version it was read at, and one that moved since refuses the whole reorder
   * with 409 and the rows that moved, and nothing is written. The scope's rows
   * are locked in id order first, so two reorders of one scope queue rather
   * than interleave or deadlock.
   *
   * **The whole collection or nothing.** A partial list means somebody added a
   * row while this screen was open, and applying it would interleave two orders
   * into one neither analyst chose. The refusal is the useful answer, which is
   * what `useEntryReorder` already tells the analyst.
   *
   * **Only rows that actually moved reach the feed.** Renumbering every row on
   * every reorder would repaint every other analyst's screen for rows that did
   * not change.
   *
   * Answers every row in the order written, with the version it now holds.
   */
  async reorder(
    def: CollectionDefinition,
    caseId: string,
    sent: { id: string; version: number }[],
    actorId: string,
  ): Promise<{ rows: { id: string; version: number }[] }> {
    const ids = sent.map((row) => row.id)
    // **Declared, not derived.** Every collection has an `orderBy`, so asking
    // the table settles nothing; only a collection that names a `position`
    // column has somewhere to record an order an analyst chose.
    if (!def.position) {
      throw new UnprocessableEntityException({
        message: `${def.name} rows carry no order an analyst sets.`,
      })
    }
    const cols = columns(def)
    const order = columnOf(def.table, def.position)

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

      const current = (await tx
        .select({ id: cols.id, position: order, version: cols.version })
        .from(def.table)
        .where(scope && rows[0] ? eq(scope, rows[0].scope as never) : undefined)
        .orderBy(asc(cols.id))
        .for('update')) as { id: string; position: number; version: number }[]
      if (current.length !== ids.length) {
        throw new UnprocessableEntityException({
          message: `A reorder names every row in the ${def.orderWithin ?? 'collection'}, once each.`,
        })
      }

      const read = new Map(current.map((row) => [row.id, row.version]))
      const refused = sent.filter((row) => read.get(row.id) !== row.version).map((row) => row.id)
      if (refused.length > 0) {
        throw new ConflictException({
          message:
            refused.length === 1
              ? 'One of those changed since you read it, so nothing was reordered.'
              : `${String(refused.length)} of those changed since you read them, so nothing was reordered.`,
          refused,
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
      const bumped = new Map(moved.map((row) => [row.id, row.version]))
      const written = sent.map((row) => ({ id: row.id, version: bumped.get(row.id) ?? row.version }))
      return { rows: written, moved: moved.length }
    })

    if (result.moved > 0) this.announce(caseId, [def.name], actorId)
    return { rows: result.rows }
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
    refuseDerived(def, fields)
    await def.refuseUnservedTerm?.(this.db, [fields])
    const cols = columns(def)

    const result = await withCase(this.db, caseId, async (tx) => {
      // One patch reaches every named row, so the reference is checked once.
      await refuseDanglingReferences(tx, def, fields)

      // A cross-field rule is a property of each *result*, so it is checked
      // per row rather than once -- two rows can differ in the half the patch
      // does not name.
      //
      // **The version goes with it, so a moved row is answered by the version
      // check rather than by this one.** Without it the two doors give two
      // answers for the same act.
      for (const row of rows) {
        await refuseIfCrossFieldRuleBroken(tx, def, row.id, fields, row.version)
      }

      // **The version travels in the statement, not in a read before it**,
      // which would leave open the window this check exists to close.
      const pairs = rows.map((row) => sql`(${row.id}::uuid, ${row.version})`)
      const updated = (await tx
        .update(def.table)
        .set({
          ...coerceTimes(def.table, fields),
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
    refuseDerived(def, patch)
    await def.refuseUnservedTerm?.(this.db, [patch])

    /**
     * **Checked in its own scoped transaction, ahead of the write.**
     * `updateVersioned` opens its own, so there is no shared one to run this
     * inside. The gap that leaves is benign: a referenced row deleted between
     * the check and the write leaves the reference null by its own `set null`,
     * which is the same outcome as never naming it.
     */
    await withCase(this.db, caseId, async (tx) => {
      await refuseDanglingReferences(tx, def, patch)
      await refuseIfCrossFieldRuleBroken(tx, def, id, patch, expectedVersion)
    })

    const result = await updateVersioned<{ id: string; version: number }>(this.db, {
      table: def.table,
      entity: def.name,
      caseId,
      id,
      expectedVersion,
      actorId,
      patch: coerceTimes(def.table, patch),
    })

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
    const cols = columns(def)
    const deleting = () => withCase(this.db, caseId, async (tx) => {
      const deleted = (await tx
        .delete(def.table)
        .where(
          and(
            eq(cols.id, id),
            eq(cols.caseId, caseId),
            eq(cols.version, expectedVersion),
          ),
        )
        .returning({ id: cols.id, ...digestOf(def.name) })) as {
        id: string
        hash?: string | null
      }[]

      if (deleted.length === 0) return deleted

      await tx.insert(changeFeed).values({
        caseId,
        entity: def.name,
        entityId: id,
        op: 'delete',
        version: expectedVersion,
        actorId,
        fields: [],
      })
      return deleted
    })
    const removed = await this.store.exclusive(caseId, async () => {
      const gone = await deleting()
      await release(this.db, this.store, caseId, gone.map((row) => row.hash))
      return gone.length > 0
    })

    if (removed) this.announce(caseId, [def.name], actorId)
    return removed
  }

  async get(def: CollectionDefinition, caseId: string, id: string): Promise<unknown> {
    const cols = columns(def)
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
