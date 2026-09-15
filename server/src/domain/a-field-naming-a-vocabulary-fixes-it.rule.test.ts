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
 * whether the type fixes the list. This walks every schema a write is judged by
 * and offers each tagged field a term nothing defines.
 *
 * **What this does not cover:** whether the served list and the enum hold the
 * same terms, which is `vocabularies.lists.test.ts`; whether a field that
 * should carry a tag is missing one, which is invisible here; and whether a
 * term belongs under the parent that offered it, which no single field can
 * answer. -> #701
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { FORM_SCHEMAS } from '../specs/specs.controller.js'
import { fields } from './field-spec.js'
import { caseComplianceSchema } from './entities/case-compliance.js'
import { caseFactsSchema } from './entities/case-facts.js'
import { reportBlockSchema, reportSchema } from './entities/report.js'

/**
 * A term no vocabulary in this tree defines, offered bare and wrapped.
 *
 * **Both, because a tagged field may take a list.** A bare string offered to an
 * array field is refused on shape, which scores it closed whatever it would
 * store -- and three of the four fields this rule found are arrays.
 *
 * **Short, or a field refuses it for being long and the rule reads that as
 * membership.** `reports.language` is `text(16)`.
 */
const UNDEFINED_TERM = 'zzq'

/**
 * Every schema a write is judged by, and so every schema a tag can sit on.
 *
 * **Wider than `FORM_SCHEMAS`**, which is what the `/specs` route serves and
 * omits every schema no form draws: a report and its blocks, and the case's
 * facts and compliance answers, which are validated on their own routes rather
 * than through `caseFormSchema`. A walk of the forms alone sees 32 of 68
 * tagged fields and reports the rest closed by never offering them anything.
 */
const SEARCHED: readonly { where: string; schema: z.ZodObject }[] = [
  ...Object.entries(FORM_SCHEMAS).map(([name, { schema }]) => ({ where: name, schema })),
  { where: 'reportSchema', schema: reportSchema },
  { where: 'reportBlockSchema', schema: reportBlockSchema },
  { where: 'caseFactsSchema', schema: caseFactsSchema },
  { where: 'caseComplianceSchema', schema: caseComplianceSchema },
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
  it('walks every schema a write is judged by', () => {
    // A floor near the true count, because the failure this guards against is
    // the walk narrowing without saying so: a list finding 32 of 68 passes any
    // bound loose enough to feel safe, which is the state this rule shipped in.
    // Raise it when a schema is added rather than leaving slack.
    expect(tagged().length).toBeGreaterThan(60)
    expect(
      SEARCHED.filter(({ schema }) => Object.keys(schema.shape).length === 0),
      'an empty schema offers no field to probe and reads as a clean walk',
    ).toEqual([])
  })

  it('refuses a term the vocabulary does not hold', () => {
    const open = tagged()
      .filter(
        (one) =>
          one.schema.safeParse(UNDEFINED_TERM).success ||
          one.schema.safeParse([UNDEFINED_TERM]).success,
      )
      .map((one) => `${one.where} (vocabulary: ${one.vocabulary})`)
      .sort()

    expect(
      open,
      'these fields publish a list and fix nothing, so every door -- the API, a bulk write, ' +
        'an archive import -- stores a term no vocabulary defines',
    ).toEqual(KNOWN_OPEN)
  })
})
