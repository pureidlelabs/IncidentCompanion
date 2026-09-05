/**
 * One implementation of every entity collection's reads and writes: rows
 * belonging to a case, written under a version check, announced on a change
 * feed, attributed to the caller.
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
   */
  readonly name: CollectionName
  readonly table: PgTable
  /** The column rows are ordered by. The timeline's is its time, not its id. */
  readonly orderBy: string
  /**
   * The column a manual order is written to, for the collections that have
   * one. Absent means the collection cannot be reordered.
   */
  readonly position?: string
  /**
   * The column an order is scoped *within*, where one exists.
   */
  readonly orderWithin?: string
  /**
   * Which schema a row validates against, for the reference check.
   */
  readonly schemaFor?: (values: Record<string, unknown>) => z.ZodObject | undefined
  /**
   * Refuse a write that lands in a row this collection considers closed.
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
   */
  private async refuseIfHeldByAnother(
    caseId: string,
    entity: string,
    id: string,
    actorId: string,
  ): Promise<void> {
    /**
     * **A store that cannot answer means nobody is known to hold this.**
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
   * The handle, for the callers that query across collections rather than within
   * one: `bulk-delete` counting references over every table before it deletes
   * anything, and `exports`.
   */
  get database(): Database {
    return this.db
  }

  /**
   * The four columns this service reaches for by name, resolved once and eagerly
   * - a table missing one is a schema defect, and failing here names it.
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

      // The feed rows are chunked for the same reason, and each still names
      // the fields its own row was created with.
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
   * **Deletes are version-checked too.**
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
