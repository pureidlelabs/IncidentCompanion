/**
 * A value an analyst pasted, with the characters nobody can see taken out.
 *
 * **Normalising, never refusing.** An analyst copying an address out of an
 * alert console, a ticket or a PDF brings invisible characters with it, and a
 * schema that refused them would make this app the one place the artefact
 * cannot be recorded. So the value is cleaned and written, and nothing is
 * rejected. -> `indicator-shape.ts`, which takes the same position on shape.
 *
 * **What it costs when it is missing is silent in every direction.** The
 * character renders as nothing, so the field looks correct; `identity.ts` keys
 * on the string, so the row never matches its own re-import and the table
 * doubles; `hashes.lists.ts` reads a digest's algorithm from its length, so a
 * padded hash exports to STIX with no algorithm. Nothing goes red.
 */
import { z } from 'zod'

import { withoutInvisibles } from './invisible.lists.js'

export { INVISIBLE, withoutInvisibles } from './invisible.lists.js'

/**
 * Wrap a string schema so a pasted value is cleaned before it is judged.
 *
 * Stripping runs **before** the wrapped schema, so `.trim()` reaches space an
 * invisible character was standing behind and `.max()` counts what is actually
 * stored. Anything that is not a string is handed on untouched, which is what
 * lets a `.default()` underneath still fire on an absent value.
 *
 * **A `z.preprocess` and not a `.transform()`**: the wrapped schema stays the
 * one that refuses, so the length ceiling, the default and the published JSON
 * Schema are all unchanged - `pasted.test.ts` pins each.
 */
export function pasted<T extends z.ZodType>(schema: T): T {
  return z.preprocess(
    (value) => (typeof value === 'string' ? withoutInvisibles(value) : value),
    schema,
  ) as unknown as T
}
