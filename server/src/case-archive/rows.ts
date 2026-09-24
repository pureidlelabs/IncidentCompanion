/**
 * What an archive's rows are judged by before any of them is written.
 *
 * The collection's own write schema, widened by the columns an export carries
 * that no analyst writes -- the evidence store's record of an artefact, a
 * report's lifecycle, a Yjs document. Those are server-written and only the
 * archive knows them, so the write schema has no reason to describe them and
 * an import still has to carry them.
 *
 * **Which door a row came through is not one of them.** That is the importing
 * door's own answer, stamped rather than read. -> `db/import-stamp.ts`
 *
 * **Named by the key the case document uses**, which is the archive's wire
 * name and not always the collection's: the case document says
 * `networkIndicators` where the collection is `network_indicators`.
 */
import { z } from 'zod'

import { COLLECTION_SCHEMAS, TIMELINE_WRITE_SCHEMAS } from '../domain/collections.js'
import { reportBlockSchema, reportSchema } from '../domain/entities/report.js'

/**
 * The collection behind each key of the case document, where the two differ.
 *
 * The case document is a wire contract and the collection name is another, so
 * neither is free to move to match the other. -> `cases/cases.service.ts`
 */
const COLLECTION_OF: Readonly<Record<string, string>> = {
  networkIndicators: 'network_indicators',
  cloudApps: 'cloud_apps',
  reportBlocks: 'report_blocks',
}

/**
 * A timestamp as an archive carries it, which is what `JSON.stringify` made of
 * a `Date`.
 *
 * Left as the string it arrived as: the importer turns it into a `Date` after
 * this, because the column wants one.
 */
const when = z.iso.datetime().nullable().optional()

/**
 * Columns an export carries that the collection's write schema does not
 * describe, by the case document's key.
 *
 * **Typed, not bounded.** A column's range and length are the database's and
 * are stated there; restating them here makes a second description that drifts
 * from the one enforcing it. What this settles is the shape -- that a digest is
 * a string rather than an object, that an assumed time is a boolean -- and a
 * value the shape admits and the column refuses is reported by
 * `import.service.ts` as a refusal naming the collection. -> #625
 */
const CARRIED: Readonly<Record<string, z.ZodRawShape>> = {
  evidence: {
    hash: z.string(),
    hashAlgorithm: z.string().nullable().optional(),
    storedAt: when,
    sizeBytes: z.int().nullable().optional(),
    contentType: z.string().nullable().optional(),
    originalFilename: z.string(),
  },
  reports: {
    sentAt: when,
    frozen: z.unknown(),
    frozenAt: when,
  },
  timeline: {
    timeAssumed: z.boolean(),
  },
}

/**
 * The schema for collections whose write schema `COLLECTION_SCHEMAS` does not
 * publish.
 *
 * The timeline's depends on the row's `kind` and is answered below; these two
 * are absent from the registry because neither is a bulk target, which is a
 * statement about selections rather than about whether the rows have a shape.
 */
const SUPPLIED: Readonly<Record<string, z.ZodObject>> = {
  reports: reportSchema,
  reportBlocks: reportBlockSchema,
}

/**
 * The base schema a row of this collection is judged by, before the carried
 * columns are added.
 *
 * A timeline row is an event or an activity and the two take different fields,
 * so the row's own `kind` chooses. A row naming neither is refused rather than
 * waved through: that is the case where an action's fields could be written
 * onto an event.
 */
function baseOf(collection: string, row: Record<string, unknown>): z.ZodObject | undefined {
  if (collection === 'timeline') {
    const kind = row['kind']
    return kind === 'event' || kind === 'action' ? TIMELINE_WRITE_SCHEMAS[kind] : undefined
  }
  return SUPPLIED[collection] ?? COLLECTION_SCHEMAS[COLLECTION_OF[collection] ?? collection]
}

/**
 * Every key of the case document this module can judge a row of.
 *
 * Read by `import.service.ts` so a collection it writes and this cannot judge
 * is a failure of the suite rather than a table that quietly goes unchecked.
 */
export const JUDGED = new Set([
  ...Object.keys(COLLECTION_SCHEMAS),
  ...Object.keys(COLLECTION_OF),
  ...Object.keys(SUPPLIED),
  'timeline',
])

/**
 * The schema an archive row of this collection is parsed against, or
 * `undefined` where the row names no shape this build knows.
 *
 * Every field is optional: an archive written by another build of this
 * application carries what that build had, and a column this one does not know
 * is dropped rather than refused. What is refused is a field this build *does*
 * know, carrying something it cannot mean.
 */
export function archiveRowSchema(
  collection: string,
  row: Record<string, unknown>,
): z.ZodObject | undefined {
  const base = baseOf(collection, row)
  if (!base) return undefined
  // **Rebuilt from the shape, because a write schema is `.strict()`.** Strict
  // refuses the columns every archive carries and no analyst writes -- `id`,
  // `caseId`, `version` -- so inheriting it refuses every ordinary archive.
  // Stripping is what drops them, and drops a column a later build added.
  return z
    .object(base.shape)
    .extend(CARRIED[collection] ?? {})
    .partial()
}
