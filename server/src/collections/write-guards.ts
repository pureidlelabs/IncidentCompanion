/**
 * What a write is checked against before it lands, on the caller's own
 * transaction: the case boundary on its references, the cross-field rules in
 * its schema, and the times it spells as strings.
 *
 * Free functions rather than methods: none reads the service's state, and
 * `report/freeze.test.ts` counts the service's methods to decide which of them
 * owe a closed-row guard.
 */
import { BadRequestException } from '@nestjs/common'
import { eq, getTableColumns } from 'drizzle-orm'

import { columnOf } from '../db/column-access.js'
import type { Transaction } from '../db/client.js'
import { COLLECTION_SCHEMAS } from '../domain/collections.js'
import { hasCrossFieldRule } from '../domain/field-spec.js'
import type { CollectionDefinition } from './collection.service.js'
import { danglingReferences, refusalFor } from './reference-check.js'

function danglingIn(tx: Transaction, def: CollectionDefinition, values: Record<string, unknown>) {
  const schema = def.schemaFor?.(values) ?? COLLECTION_SCHEMAS[def.name]
  return schema ? danglingReferences(tx, schema, values) : Promise.resolve([])
}

/**
 * The four columns this service reaches for by name, resolved once and
 * eagerly - a table missing one is a schema defect, and failing here names
 * it. Named properties rather than a string index, so a typo is a compile
 * error. -> `db/column-access.ts`
 */
export function columns(def: CollectionDefinition) {
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
export async function refuseDanglingReferences(
  tx: Transaction,
  def: CollectionDefinition,
  values: Record<string, unknown>,
  /** 1-based, for a batch. Omitted for a single write, which has no row. */
  row?: number,
): Promise<void> {
  const dangling = await danglingIn(tx, def, values)
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
export async function dropForeignReferences(
  tx: Transaction,
  def: CollectionDefinition,
  values: Record<string, unknown>,
): Promise<number> {
  const dangling = await danglingIn(tx, def, values)
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
export async function refuseIfCrossFieldRuleBroken(
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
 * ISO strings become `Date`s for the columns that are timestamps.
 *
 * **Derived from the table, never from the field name.** Every time arrives
 * as a string, because a schema is also the API document and JSON Schema has
 * no date type - and the columns carrying one share no naming rule.
 */
export function coerceTimes(
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
