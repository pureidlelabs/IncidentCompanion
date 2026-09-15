/**
 * **A field that names a vocabulary refuses a term the vocabulary does not
 * hold.**
 *
 * A `vocabulary:` tag names a list the application serves, and a screen draws
 * that list as the options of a select. What the tag does not do is constrain
 * the column: the schema beside it does. Where the schema is an enum the two
 * agree and every door refuses an undefined term; where it is a bare string the
 * vocabulary is guidance, and the API, a bulk write and an archive import all
 * take whatever is sent. -> #675
 *
 * **Asked of the schema rather than read off the source.** The tag and the type
 * sit on one declaration, so a grep can find the pair but only parsing can say
 * whether the type fixes the list. This walks the registry `field()` writes to
 * and offers each tagged field a term nothing defines.
 *
 * **What this does not cover:** whether the served list and the enum hold the
 * same terms, which is `vocabularies.lists.test.ts`, and whether a field that
 * should carry a tag is missing one -- an absent tag is invisible here.
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { FORM_SCHEMAS } from '../specs/specs.controller.js'
import { fields } from './field-spec.js'
import { reportSchema } from './entities/report.js'

/**
 * A term no vocabulary in this tree defines.
 *
 * **Under every tagged field's length cap**, or a field refuses it for being
 * long and the rule reads that as membership. `reports.language` is `text(16)`.
 */
const UNDEFINED_TERM = 'zzq'

/**
 * Every schema a `vocabulary:` tag can be declared on.
 *
 * **`FORM_SCHEMAS` rather than `COLLECTION_SCHEMAS`**, which deliberately omits
 * the timeline's two write schemas -- and one of the two open fields is in
 * them. `reportSchema` is named beside it because a report is not a collection
 * form and appears in no form list, so a walk of the forms alone cannot see it.
 */
const SEARCHED: readonly { where: string; schema: z.ZodObject }[] = [
  ...Object.entries(FORM_SCHEMAS).map(([name, { schema }]) => ({ where: name, schema })),
  { where: 'reportSchema', schema: reportSchema },
]

/** Every tagged field, as where it lives, its schema and its vocabulary. */
function tagged(): { where: string; vocabulary: string; schema: z.ZodType }[] {
  const found: { where: string; vocabulary: string; schema: z.ZodType }[] = []
  for (const { where, schema } of SEARCHED) {
    for (const [name, sub] of Object.entries(schema.shape)) {
      const meta = fields.get(sub as z.ZodType)
      if (meta?.vocabulary) {
        found.push({
          where: `${where}.${name}`,
          vocabulary: meta.vocabulary,
          schema: sub as z.ZodType,
        })
      }
    }
  }
  return found
}

/**
 * The one tagged field whose list a schema cannot hold, and why.
 *
 * A report's language codes are rows in `report_language` -- an operator
 * uploads a pack and the list grows -- so nothing static can fix it and the
 * check has to read the table. A report is written through the generic
 * collection path, where validation is Zod and therefore synchronous, so that
 * is a write-path change rather than a schema one. -> #699
 */
const KNOWN_OPEN: readonly string[] = ['reportSchema.language (vocabulary: reportLanguage)']

describe('a field that names a vocabulary', () => {
  it('finds tagged fields to check', () => {
    // Without this the case below passes over an empty list, which is what a
    // moved registry or a renamed tag looks like from here.
    expect(tagged().length).toBeGreaterThan(20)
  })

  it('refuses a term the vocabulary does not hold', () => {
    const open = tagged()
      .filter((one) => one.schema.safeParse(UNDEFINED_TERM).success)
      .map((one) => `${one.where} (vocabulary: ${one.vocabulary})`)
      .sort()

    expect(
      open,
      'these fields publish a list and fix nothing, so every door -- the API, a bulk write, ' +
        'an archive import -- stores a term no vocabulary defines',
    ).toEqual(KNOWN_OPEN)
  })
})
