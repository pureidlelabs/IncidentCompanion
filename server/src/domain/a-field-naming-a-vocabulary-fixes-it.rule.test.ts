/**
 * **A field that names a vocabulary refuses a term the vocabulary does not
 * hold, and accepts every term it does.**
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
 * and offers each tagged field both a term nothing defines and every term its
 * own list publishes.
 *
 * **The positive case is the half that catches a schema bound to the wrong
 * list.** Refusing `zzq` says a field enumerates something; it does not say it
 * enumerates the right thing, and a one-token slip binding a field to a
 * neighbouring vocabulary passes the negative case with every test green.
 *
 * **What this does not cover:** a tag whose list neither registry publishes,
 * which `UNSERVED` names rather than checks -- nothing can compare a schema
 * against a list that does not exist; whether a term belongs under the parent
 * that offered it, which no single field can answer (#701); and whether a field
 * that should carry a tag is missing one, which is invisible here.
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { FORM_SCHEMAS, VOCABULARIES } from '../specs/specs.controller.js'
import { COMPLIANCE } from './compliance-form.js'
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
 * The unanswered state, which a served list carries as a member and a schema
 * does not.
 *
 * A compliance vocabulary is published with a leading `''` because that is what
 * an unanswered select sends; the schema spells the same state `null`. Offering
 * it as a term reports 25 fields as refusing their own list.
 */
const UNANSWERED = ''

/** Every schema a write is judged by, and so every schema a tag can sit on. */
const SEARCHED: readonly { where: string; schema: z.ZodObject }[] = [
  ...Object.entries(FORM_SCHEMAS).map(([name, { schema }]) => ({ where: name, schema })),
  { where: 'reportSchema', schema: reportSchema },
  { where: 'reportBlockSchema', schema: reportBlockSchema },
  { where: 'caseFactsSchema', schema: caseFactsSchema },
  { where: 'caseComplianceSchema', schema: caseComplianceSchema },
]

/**
 * How many tagged fields the walk above reaches.
 *
 * **Exact, because a floor cannot see the walk narrowing.** This rule shipped
 * reaching 32 of 68 under a `> 20` guard, which a halved walk passes
 * comfortably. A new tagged field fails this until it is added deliberately,
 * and that is the point of the number.
 */
const TAGGED_FIELDS = 68

/**
 * Tags whose list neither registry publishes, so nothing can check them.
 *
 * `VOCABULARIES` is what `/specs` serves and `COMPLIANCE` is what the
 * compliance screen draws; a tag in neither names a list that exists only as
 * the schema's own enum. Named rather than skipped, so a tag pointing at
 * nothing is visible instead of quietly uncovered.
 *
 * `rsitClass` and `rsitType` are the case's facts, which no route validates
 * and no form serves. `language` is #699, `doraRootCauseAdditional` is #702.
 */
const UNSERVED: readonly string[] = [
  'caseComplianceSchema.doraRootCauseAdditional (doraRootCauseAdditional)',
  'caseFactsSchema.rsitClass (rsitClass)',
  'caseFactsSchema.rsitType (rsitType)',
  'reportBlockSchema.kind (blockKind)',
  'reportSchema.language (reportLanguage)',
  'reportSchema.stage (reportStage)',
  'reportSchema.status (reportStatus)',
  'reportSchema.tlp (tlp)',
]

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

const snake = (name: string) => name.replace(/[A-Z]/g, (letter) => '_' + letter.toLowerCase())

/** What the compliance screen offers for a field, by its wire spelling. */
function servedByForm(field: string): readonly string[] | undefined {
  const wanted = snake(field)
  for (const form of Object.values(COMPLIANCE.forms)) {
    for (const one of form.fields) {
      if (one.name === wanted && one.options && one.options.length > 0) return one.options
    }
  }
  return undefined
}

interface Tagged {
  where: string
  vocabulary: string
  schema: z.ZodType
  served?: readonly string[]
}

/** Every tagged field, with the list its tag names where one is published. */
function tagged(): Tagged[] {
  const found: Tagged[] = []
  for (const { where, schema } of SEARCHED) {
    for (const [name, sub] of Object.entries(schema.shape)) {
      const meta = fields.get(sub as z.ZodType)
      if (!meta?.vocabulary) continue
      const published = VOCABULARIES[meta.vocabulary] ?? servedByForm(name)
      found.push({
        where: `${where}.${name}`,
        vocabulary: meta.vocabulary,
        schema: sub as z.ZodType,
        ...(published && published.length > 0 ? { served: published } : {}),
      })
    }
  }
  return found
}

const takes = (schema: z.ZodType, term: string) =>
  schema.safeParse(term).success || schema.safeParse([term]).success

describe('a field that names a vocabulary', () => {
  it('walks every schema a write is judged by', () => {
    expect(
      tagged().length,
      'the walk reaches a different number of tagged fields than it did -- add the new ' +
        'schema to SEARCHED and raise the count, or find out what stopped being reached',
    ).toBe(TAGGED_FIELDS)
  })

  it('refuses a term the vocabulary does not hold', () => {
    const open = tagged()
      .filter((one) => takes(one.schema, UNDEFINED_TERM))
      .map((one) => `${one.where} (vocabulary: ${one.vocabulary})`)
      .sort()

    expect(
      open,
      'these fields publish a list and fix nothing, so every door -- the API, a bulk write, ' +
        'an archive import -- stores a term no vocabulary defines',
    ).toEqual(KNOWN_OPEN)
  })

  it('accepts every term the list it names publishes', () => {
    const refused = tagged()
      .filter((one) => one.served)
      .flatMap((one) =>
        one.served!
          .filter((term) => term !== UNANSWERED && !takes(one.schema, term))
          .map((term) => `${one.where} (${one.vocabulary}) refuses ${JSON.stringify(term)}`),
      )
      .sort()

    expect(
      refused,
      'the screen offers a term the schema will not store, so the analyst picks an option ' +
        'and the save is refused -- or the field is bound to the wrong vocabulary entirely',
    ).toEqual([])
  })

  it('names every tag whose list neither registry publishes', () => {
    const unserved = tagged()
      .filter((one) => !one.served)
      .map((one) => `${one.where} (${one.vocabulary})`)
      .sort()

    expect(unserved).toEqual(UNSERVED)
  })
})
