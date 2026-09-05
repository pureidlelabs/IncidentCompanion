/**
 * Writing a CSV back into a collection: parse, convert the keys, validate. The
 * middle step is not optional - a CSV header carries the database's spelling
 * (`system_type`) because that is what the export writes.
 *
 * All or nothing: `createMany` is one transaction, so a file whose 400th row
 * is bad leaves the case exactly as it was.
 */
import { BadRequestException, Injectable, Optional } from '@nestjs/common'
import { getTableColumns } from 'drizzle-orm'


import { CsvInvalid, parseCsv, type CsvShape } from './csv-import.js'
import { CollectionService } from '../collections/collection.service.js'
import { ConflictsService } from '../collections/conflicts.service.js'
import { TABLES, type BulkTarget } from '../collections/registry.js'
import { COLLECTION_SCHEMAS, IMPORTABLE } from '../domain/collections.js'
import { camelKeys } from '../wire/naming.js'
import { hasIdentity, indexOf, keyOf, type Known } from '../collections/identity.js'

@Injectable()
export class ImportService {
  /**
   * **`conflicts` is optional for the same reason it is on the entity
   * controllers**: a refused write must be recordable, and a caller that has
   * not wired the service must still import rather than crash. Where it is
   * absent a refusal is still counted, just not reviewable.
   */
  constructor(
    private readonly collections: CollectionService,
    @Optional() private readonly conflicts?: ConflictsService,
  ) {}

  /**
   * What the parser is allowed to see, derived from the schema rather than
   * listed.
   *
   * **Both spellings are accepted.** The export writes the database's column
   * names, and an analyst writing a file by hand may well use the field names
   * they see in the app - refusing one of those would make a file the app
   * itself produced the only importable shape.
   */
  private shapeOf(collection: BulkTarget): CsvShape {
    const schema = COLLECTION_SCHEMAS[collection]!
    const allowed = new Set<string>()
    const lists = new Set<string>()
    const booleans = new Set<string>()

    /**
     * **Everything the export writes that a client may not set.** Derived from
     * the table minus the schema rather than listed, so a column added to
     * `rowVersioning` cannot quietly become importable - and so the app's own
     * export stays importable, which is the property that pays for this.
     */
    const table = TABLES[collection]
    const ignored = new Set<string>()
    for (const [property, column] of Object.entries(getTableColumns(table))) {
      if (property in schema.shape) continue
      ignored.add(property)
      ignored.add((column as { name: string }).name)
    }

    for (const [field, sub] of Object.entries(schema.shape)) {
      const kind = (sub as { def?: { type?: string; innerType?: { def?: { type?: string } } } }).def
      const inner = kind?.type === 'default' ? kind.innerType?.def?.type : kind?.type

      for (const spelling of [field, snake(field)]) {
        allowed.add(spelling)
        if (inner === 'array') lists.add(spelling)
        if (inner === 'boolean') booleans.add(spelling)
      }
    }
    return { allowed, ignored, lists, booleans }
  }


  /**
   * Add every row in the file, or none of them.
   *
   * **Validated per row against the same schema a create uses.** An import is
   * not a back door: a value a form would refuse is a value a file cannot
   * write either, and saying which row failed is what makes a 400 actionable.
   */
  async fromCsv(
    collection: BulkTarget,
    caseId: string,
    text: string,
    actorId: string,
    onDuplicate: OnDuplicate = 'skip',
  ): Promise<ImportResult> {
    if (!COLLECTION_SCHEMAS[collection]) {
      throw new BadRequestException({
        message: `No collection ${collection}. Importable: ${IMPORTABLE.sort().join(', ')}.`,
      })
    }

    let parsed: Record<string, unknown>[]
    try {
      parsed = parseCsv(text, this.shapeOf(collection))
    } catch (error) {
      if (error instanceof CsvInvalid) throw new BadRequestException({ message: error.message })
      throw error
    }
    if (parsed.length === 0) return { added: 0, skipped: 0, replaced: 0, refused: 0, unlinked: 0 }

    const schema = COLLECTION_SCHEMAS[collection]
    const rows = parsed.map((raw, index) => {
      /**
       * An empty cell is a value nobody gave, not an empty string - a CSV has
       * no way to write "absent", and the export writes a blank for a null
       * timestamp. The cost: an import cannot set a text field to the empty
       * string.
       */
      const given = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== ''))
      const result = schema.safeParse(camelKeys(given))
      if (!result.success) {
        const first = result.error.issues[0]
        throw new BadRequestException({
          message: `CSV row ${index + 2} is not a valid ${collection} row: ${first?.message ?? 'invalid'}${
            first?.path.length ? ` (${first.path.join('.')})` : ''
          }`,
        })
      }
      return result.data
    })

    const def = { name: collection, table: TABLES[collection], orderBy: 'createdAt' }


    /**
     * **Nothing to dedup against for a collection with no identity.** An
     * action, a note, an evidence record and an impact row are events or
     * judgements rather than things: two that look alike are two facts, and
     * merging them loses one. -> `collections/identity.ts`
     */
    if (!hasIdentity(collection)) {
      const written = await this.collections.createMany(def, caseId, rows, actorId, 'drop')
      return {
        added: written.ids.length,
        skipped: 0,
        replaced: 0,
        refused: 0,
        unlinked: written.unlinked,
      }
    }

    /**
     * **Decided before the insert, not caught on conflict.** `createMany` is
     * one transaction so a file's 400th row failing leaves the case untouched -
     * which is the property that makes an import safe, and also the reason a
     * per-row `ON CONFLICT` is not available: there is no unique constraint to
     * conflict on, and adding one would refuse the duplicates a case is
     * *allowed* to hold from before this existed.
     */
    const seen = indexOf(collection, (await this.collections.list(def, caseId)) as Record<
      string,
      unknown
    >[])

    const fresh: Record<string, unknown>[] = []
    const collisions: { known: Known; row: Record<string, unknown> }[] = []
    for (const row of rows) {
      const key = keyOf(collection, row)
      // **A row with no key is always fresh.** An empty hostname is an absent
      // identity rather than an identity of "", so two blank rows are two rows.
      if (key === null) {
        fresh.push(row)
        continue
      }
      const already = seen.get(key)
      if (already === undefined) {
        fresh.push(row)
        // **Added as we go, or a file listing one host twice imports it
        // twice** - the same defect through the file rather than the case.
        // **The empty id marks it as minted here rather than found**, and a
        // later line matching it is skipped rather than replacing it: first
        // wins within one file. The alternative - last wins - would make the
        // result depend on row order for no reason an analyst could see, and a
        // file is not a sequence of edits.
        seen.set(key, { id: '', version: 0 })
        continue
      }
      collisions.push({ known: already, row })
    }

    const written = await this.collections.createMany(def, caseId, fresh, actorId, 'drop')

    if (onDuplicate === 'skip' || collisions.length === 0) {
      return {
        added: written.ids.length,
        skipped: collisions.length,
        replaced: 0,
        refused: 0,
        unlinked: written.unlinked,
      }
    }

    /**
     * **`replace` writes each match on its own**, because two rows matching one
     * key take different values - `updateMany` sets one patch across a list of
     * ids and would give every duplicate the last row's fields.
     *
     * A row minted in this same import has an empty id, as `keyOf` records, and is
     * skipped rather than replaced: it was just written from the file, so
     * replacing it with a later line silently keeps only the last.
     */
    let replaced = 0
    let refused = 0
    for (const { known, row } of collisions) {
      if (!known.id) continue
      /**
       * Passes the version it read, so the check still applies and a
       * concurrent edit is recorded rather than retried against a base the
       * other analyst moved. -> `CLAUDE.md`, "a read may refresh; a write may
       * not"
       *
       * `update` throws when another analyst holds the row open, and one row
       * failing must not abandon the rest.
       */
      let result: { ok: boolean } | null
      try {
        result = await this.collections.update(def, caseId, known.id, known.version, row, actorId)
      } catch {
        // Held open by somebody else. Not an error for the import: that row is
        // theirs for the moment and the rest of the file is still good.
        result = null
      }

      if (result?.ok) {
        replaced += 1
        continue
      }

      refused += 1
      /**
       * **The refused values exist nowhere else once this returns.** The row
       * holds the other analyst's and the file is a stream the caller has
       * already sent, so recording it is what makes the review answerable - the
       * same reason `entities.controller` records before it refuses.
       */
      await this.conflicts?.record({
        caseId,
        userId: actorId,
        entity: collection,
        entityId: known.id,
        base: {},
        mine: row,
      })
    }
    return {
      added: written.ids.length,
      skipped: collisions.length - replaced - refused,
      replaced,
      refused,
      unlinked: written.unlinked,
    }
  }
}

/**
 * What to do with a row whose identity is already in the case.
 *
 * **The analyst chooses, and the default is the safe one.** `skip` cannot lose
 * work; `replace` overwrites fields somebody may have edited since the first
 * import, which is a reasonable thing to want after correcting a source file
 * and a bad thing to do without being asked.
 */
export type OnDuplicate = 'skip' | 'replace'

/**
 * **Three numbers, because one would hide the interesting half.** An import
 * reporting only `added` looks identical whether it wrote 40 rows or wrote 12
 * and silently passed over 28 - and the second is the case an analyst needs to
 * see.
 */
export interface ImportResult {
  added: number
  skipped: number
  replaced: number
  /**
   * **Refusals are their own number, not folded into `skipped`.** They mean the
   * opposite things: skipped is "already there, you asked me to leave it" and
   * refused is "somebody else changed or is holding this row, and your values
   * are in a merge review".
   */
  refused: number
  /**
   * Rows that landed with a reference nulled, because it named a row in
   * another case.
   *
   * **Its own number for the same reason `refused` is.** The row is in the
   * case and the link is not, which is neither "added and fine" nor "not
   * added" -- and an analyst importing a file they exported elsewhere needs to
   * know how many of their lines came across less connected than they left.
   */
  unlinked: number
}

/** `systemType` -> `system_type`, matching what the export writes. */
function snake(field: string): string {
  return field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}
