/**
 * Writing a CSV back into a collection: parse, convert the keys, validate. The
 * middle step is not optional - a CSV header carries the database's spelling
 * (`system_type`) because that is what the export writes.
 *
 * All or nothing: `createMany` is one transaction, so a file whose 400th row
 * is bad leaves the case exactly as it was.
 */
import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { getTableColumns } from 'drizzle-orm'

import { CsvInvalid, parseCsv, type CsvShape } from './csv-import.js'
import { CollectionService } from '../collections/collection.service.js'
import { importStamp } from '../db/import-stamp.js'
import type { CollectionName } from '../domain/wire.js'
import { ConflictsService } from '../collections/conflicts.service.js'
import { REFERENCE_TABLES, TABLES, type BulkTarget } from '../collections/registry.js'
import { IMPORTABLE, importSchemaFor, importSchemasFor, referencesOf } from '../domain/collections.js'
import { camelKeys } from '../wire/naming.js'
import { hasIdentity, indexOf, matchIn, namingsOf, rememberIn, type Known } from '../domain/identity.js'
import { namesOf } from '../domain/reference-key.js'

/**
 * Which door a row came through, for one read out of a file.
 *
 * Prose rather than a key, matching what the other door calls itself.
 * -> `incident-import/providers/sentinel/platform.ts`
 */
export const CSV_IMPORT = 'CSV import'

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
   * Turn every reference cell from what it names into what the case holds.
   *
   * Answers how many references could not be carried, by the kind of thing
   * they pointed at, and leaves the cell empty for each of those -- a file
   * describing things the destination does not hold is an ordinary import, so
   * the row lands without the link rather than being refused.
   *
   * **Resolved only on exactly one match.** A name says which row the source
   * meant; it makes no claim that two rows sharing it are the same fact. Two
   * methods called `Mailbox audit` make a reference to that name unanswerable,
   * and picking either would attach the row to whichever the scan reached
   * first.
   *
   * **A value that is where a row was kept resolves to nothing**, and needs no
   * rule of its own to do so: a uuid is not a hostname, so it matches no row
   * in the destination and is reported lost like any other name the case does
   * not hold. That is what stops a file naming a row in a case its importer
   * may not reach. -> `openspec/specs/data-exchange/spec.md`
   */
  private async resolveReferences(
    collection: BulkTarget,
    caseId: string,
    rows: Record<string, unknown>[],
  ): Promise<Record<string, number>[]> {
    // The same lookup the export reads, so the two halves cannot disagree
    // about which fields are references. -> `domain/collections.ts`
    const references = referencesOf(collection)
    if (references.length === 0) return rows.map(() => ({}))

    // **Per row, because a row that is skipped never landed.** A total counted
    // over the parsed file told an analyst a reference could not be carried on
    // a re-import that wrote nothing at all.
    const lost: Record<string, number>[] = rows.map(() => ({}))
    const held = new Map<string, Map<string, string | null>>()

    for (const { field, target } of references) {
      const table = REFERENCE_TABLES[target]
      // A target with no table is one nothing can resolve through, which is a
      // wiring fault rather than a file's: say so instead of losing the links.
      if (!table) throw new Error(`no table for reference target ${target}`)

      if (!held.has(target)) {
        const rows_ = (await this.collections.list(
          // **`refTarget` is spelled as the collection route**, which is what
          // `CollectionName` is: `registry.ts` says so, and says what it cost
          // to learn.
          { name: target as CollectionName, table, orderBy: 'createdAt' },
          caseId,
        )) as Record<string, unknown>[]

        /**
         * **An index rather than a scan per cell.** A filter over every
         * candidate for every reference cell is O(rows x candidates), and the
         * import is capped at 50,000 rows: 20,000 impact rows against 5,000
         * hosts spent 12s of the 13.6s total inside resolution. Built once per
         * target, it is O(rows + candidates) and keeps the rule exactly.
         *
         * **`null` is ambiguous, and is not the same as absent.** Two rows
         * answering to one name resolve to nothing; a row answering to two
         * names is not ambiguous with itself, which is why the id is compared
         * rather than the presence of the key.
         */
        const answers = new Map<string, string | null>()
        for (const one of rows_) {
          const id = one['id'] as string
          for (const name of namesOf(target, one)) {
            const key = name.toLowerCase()
            const seen = answers.get(key)
            if (seen === undefined) answers.set(key, id)
            else if (seen !== id) answers.set(key, null)
          }
        }
        held.set(target, answers)
      }
      const answering = held.get(target)!

      /** The one row of the destination answering to this name, or null. */
      const resolve = (name: string): string | null =>
        answering.get(name.trim().toLowerCase()) ?? null

      for (const [at, row] of rows.entries()) {
        const mine = lost[at]!
        const given = row[field]
        if (given === undefined || given === null) continue
        // **A cell of spaces is one nobody filled in.** Counting it as a
        // reference the case could not resolve reports a loss for a link the
        // file never asked for.
        if (typeof given === 'string' && given.trim() === '') {
          delete row[field]
          continue
        }

        // **A list keeps the half that resolves.** `evidenceIds` is `NOT NULL`
        // with a `[]` default, so emptying it for one unresolvable name would
        // discard the ones that were fine and die on the constraint.
        if (Array.isArray(given)) {
          const kept: string[] = []
          for (const one of given) {
            if (typeof one !== 'string' || one === '') continue
            const id = resolve(one)
            if (id) kept.push(id)
            else mine[target] = (mine[target] ?? 0) + 1
          }
          row[field] = kept
          continue
        }

        if (typeof given !== 'string') continue
        const id = resolve(given)
        if (id) row[field] = id
        else {
          delete row[field]
          mine[target] = (mine[target] ?? 0) + 1
        }
      }
    }

    return lost
  }

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
    // The union: a file holds every column any of the collection's schemas
    // names, while each row is judged by the arm its own kind names.
    const shape: Record<string, unknown> = Object.assign(
      {},
      ...importSchemasFor(collection).map((one) => one.shape),
    ) as Record<string, unknown>
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
      if (property in shape) continue
      ignored.add(property)
      ignored.add((column as { name: string }).name)
    }

    for (const [field, sub] of Object.entries(shape)) {
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
    // **404 rather than 400, the same as the export door's.** One condition --
    // there is no such collection -- answered two ways is two answers to one
    // question, and the controller in front of this already says 404. -> #650
    if (importSchemaFor(collection) === undefined) {
      throw new NotFoundException({
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
    if (parsed.length === 0) {
      return { added: 0, skipped: 0, replaced: 0, refused: 0, unlinked: 0, unlinkedBy: {} }
    }

    const schemaOf = (row: Record<string, unknown>) => importSchemaFor(collection, row)!
    const stamp = importStamp(CSV_IMPORT, TABLES[collection])

    /**
     * An empty cell is a value nobody gave, not an empty string - a CSV has no
     * way to write "absent", and the export writes a blank for a null
     * timestamp. The cost: an import cannot set a text field to the empty
     * string.
     */
    const named: Record<string, unknown>[] = parsed.map(
      (raw) =>
        camelKeys(
          Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== '')),
        ) as Record<string, unknown>,
    )

    /**
     * **Before the schema sees them, because a name is not a uuid.** A
     * reference cell carries what the row is called in the case that wrote the
     * file, and every reference field is declared `z.uuid()` -- so a file's own
     * spelling would be refused as invalid rather than resolved.
     */
    const lost = await this.resolveReferences(collection, caseId, named)

    /** Every field some kind of this collection declares, for the filter below. */
    const elsewhere = new Set(
      importSchemasFor(collection).flatMap((one) => Object.keys(one.shape)),
    )

    const rows = named.map((given, index) => {
      const judge = schemaOf(given)
      /**
       * **A file holds one set of columns and a collection may have two kinds
       * of row.** An export of a real timeline writes the columns of both, so
       * an action arrives carrying the event-only ones -- `hideFromGraph` as
       * `false` rather than as an empty cell, because the writer reads them off
       * the table. The schemas are strict, so the arm judging the row would
       * refuse those as unrecognised keys and the app's own file would not come
       * back.
       *
       * **Only a column another kind of this collection declares is dropped.**
       * A column no kind has is left where it is and refused by name, which is
       * what catches a misspelt heading -- dropping everything the arm does not
       * name would make a typo silently do nothing.
       */
      const meant = Object.fromEntries(
        Object.entries(given).filter(([field]) => field in judge.shape || !elsewhere.has(field)),
      )
      const result = judge.safeParse(meant)
      if (!result.success) {
        const first = result.error.issues[0]
        throw new BadRequestException({
          message: `CSV row ${index + 2} is not a valid ${collection} row: ${first?.message ?? 'invalid'}${
            first?.path.length ? ` (${first.path.join('.')})` : ''
          }`,
        })
      }
      // Stamped, never read from the file: the write schemas declare no
      // `source` field, so the parse above drops whatever a file claimed.
      // -> `openspec/specs/data-exchange/spec.md`
      return { ...result.data, ...stamp }
    })

    const def = { name: collection, table: TABLES[collection], orderBy: 'createdAt' }


    /**
     * **Nothing to dedup against for a collection with no identity.** An
     * action, a note, an evidence record and an impact row are events or
     * judgements rather than things: two that look alike are two facts, and
     * merging them loses one. -> `domain/identity.ts`
     */
    if (!hasIdentity(collection)) {
      const written = await this.collections.createMany(def, caseId, rows, actorId, 'drop')
      return {
        added: written.ids.length,
        skipped: 0,
        replaced: 0,
        refused: 0,
        ...carried(lost, written.unlinked),
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
    const freshLost: Record<string, number>[] = []
    const collisions: { known: Known; row: Record<string, unknown>; lost: Record<string, number> }[] =
      []
    for (const [at, row] of rows.entries()) {
      const mine = lost[at] ?? {}
      // **A row that answers to no naming is always fresh.** An empty hostname
      // is an absent identity rather than an identity of "", so two blank rows
      // are two rows.
      if (namingsOf(collection, row).length === 0) {
        fresh.push(row)
        freshLost.push(mine)
        continue
      }
      // **Matched on the strongest naming the row gives**, which is what the
      // incident door does. Asking by the key alone found whichever row shared
      // the weakest rung, so a file naming `Dropbox / tenant-b` replaced the
      // `tenant-a` row. -> #604
      const already = matchIn(collection, seen, row)
      if (already === undefined) {
        fresh.push(row)
        freshLost.push(mine)
        // **Added as we go, or a file listing one host twice imports it
        // twice** - the same defect through the file rather than the case.
        // **The empty id marks it as minted here rather than found**, and a
        // later line matching it is skipped rather than replacing it: first
        // wins within one file. The alternative - last wins - would make the
        // result depend on row order for no reason an analyst could see, and a
        // file is not a sequence of edits.
        rememberIn(collection, seen, row, { id: '', version: 0 })
        continue
      }
      collisions.push({ known: already, row, lost: mine })
    }

    const written = await this.collections.createMany(def, caseId, fresh, actorId, 'drop')

    if (onDuplicate === 'skip' || collisions.length === 0) {
      return {
        added: written.ids.length,
        skipped: collisions.length,
        replaced: 0,
        refused: 0,
        ...carried(freshLost, written.unlinked),
      }
    }

    /**
     * **`replace` writes each match on its own**, because two rows matching one
     * key take different values - `updateMany` sets one patch across a list of
     * ids and would give every duplicate the last row's fields.
     *
     * A row minted earlier in this same import carries the empty id the pass
     * above gave it, and is skipped rather than replaced: it was just written
     * from the file, so replacing it with a later line silently keeps only the
     * last.
     */
    let replaced = 0
    let refused = 0
    const landed = [...freshLost]
    for (const { known, row, lost: mine } of collisions) {
      if (!known.id) continue
      /**
       * Passes the version it read, so the check still applies and a
       * concurrent edit is recorded rather than retried against a base the
       * other analyst moved.
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
        landed.push(mine)
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
      ...carried(landed, written.unlinked),
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
 * What the rows that landed could not carry, totalled and split by target.
 *
 * **`dropForeignReferences`' count is added and cannot say to what.** It
 * answers 1 per row rather than 1 per reference and names no collection, so it
 * moves the total without moving the split. It should never fire now -- every
 * id left in a row was resolved inside the destination case -- and it is added
 * rather than ignored because if it ever does, a reference was lost and the
 * analyst is owed it.
 */
function carried(
  lost: readonly Record<string, number>[],
  dropped: number,
): { unlinked: number; unlinkedBy: Readonly<Record<string, number>> } {
  const by: Record<string, number> = {}
  for (const row of lost) {
    for (const [target, count] of Object.entries(row)) by[target] = (by[target] ?? 0) + count
  }
  const named = Object.values(by).reduce((all, one) => all + one, 0)
  return { unlinked: named + dropped, unlinkedBy: by }
}

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
   * References the destination case could not resolve, on rows that landed.
   *
   * **Its own number for the same reason `refused` is.** The row is in the
   * case and the link is not, which is neither "added and fine" nor "not
   * added" -- and an analyst importing a file they exported elsewhere needs to
   * know how many of their lines came across less connected than they left.
   */
  unlinked: number
  /**
   * What could not be carried, by the kind of thing it pointed at.
   *
   * **Because a number alone does not tell an analyst what to go and look
   * for.** *Four references could not be carried* leaves them reading the
   * whole import; *four to hosts* names the collection to bring across first.
   */
  unlinkedBy: Readonly<Record<string, number>>
}

function snake(field: string): string {
  return field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}
