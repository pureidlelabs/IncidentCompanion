/**
 * The Compliance screen's forms, against the table they write to.
 *
 * **The defect this is named for is a form that writes nothing.** The screen
 * draws whatever the specs document declares, so a control whose name has no
 * column looks identical to one that works - it accepts a value, posts it, and
 * the write path drops it as unknown.
 *
 * The declarations are generated, so these are assertions about the *lift*,
 * not about hand-written data: a Python-side rename lands here as a red test
 * rather than as a silently inert control.
 */
import { getTableColumns } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { caseCompliance } from '../db/schema/case-compliance.js'
import { COMPLIANCE, complianceFieldNames } from './compliance-form.js'
import { caseComplianceSchema } from './entities/case-compliance.js'
import {
  DORA_ROOT_CAUSE_DETAILED,
  DORA_ROOT_CAUSE_HIGH,
} from './vocabularies/compliance.js'
import { formSpec } from './field-spec.js'

/** Python's spelling to the column's, the same conversion the client applies. */
function toCamel(name: string): string {
  return name.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
}

const COLUMNS = new Set(Object.keys(getTableColumns(caseCompliance)))

describe('the compliance forms', () => {
  it('draws no control the case compliance row cannot store', () => {
    const homeless = complianceFieldNames()
      .map(toCamel)
      .filter((name) => !COLUMNS.has(name))
    expect(homeless).toEqual([])
  })

  it('names a form for every card, in both the on and the off state', () => {
    for (const card of COMPLIANCE.cards) {
      expect(COMPLIANCE.forms[card.form], `${card.title} on`).toBeDefined()
      if (card.form_off !== null) {
        expect(COMPLIANCE.forms[card.form_off], `${card.title} off`).toBeDefined()
      }
    }
  })

  it('names a served vocabulary wherever a field claims one', () => {
    const missing: string[] = []
    for (const form of Object.values(COMPLIANCE.forms)) {
      for (const field of form.fields) {
        if (field.vocabulary && !(field.vocabulary in COMPLIANCE.vocabularies)) {
          missing.push(`${field.name} -> ${field.vocabulary}`)
        }
      }
    }
    expect(missing).toEqual([])
  })

  it('declares every kind it uses', () => {
    const kinds = new Set(COMPLIANCE.field_kinds)
    const undeclared = new Set<string>()
    for (const form of Object.values(COMPLIANCE.forms)) {
      for (const field of form.fields) if (!kinds.has(field.kind)) undeclared.add(field.kind)
    }
    expect([...undeclared]).toEqual([])
  })

  it('leaves a computed field without options, so the client renders it read-only', () => {
    // 4.3's list is rebuilt from whichever 4.2 causes this case chose. Serving
    // a static copy would offer causes the case does not owe - and would look
    // completely correct on screen.
    const computed = Object.values(COMPLIANCE.forms)
      .flatMap((form) => form.fields)
      .filter((field) => field.computed_from !== undefined)
    expect(computed.length).toBeGreaterThan(0)
    for (const field of computed) expect(field.options).toBeUndefined()
  })

  /**
   * The other direction, and the one that had drifted.
   *
   * `formSpec` projects every field declared with `field()` -- which is what
   * "meant to be drawn" means for every other collection -- so a field the
   * schema validates and no card draws is a control an analyst cannot reach.
   * It validates, it stores, and no screen offers it.
   *
   * **The sibling above cannot see this.** It walks the served names looking
   * for a column, so a field missing from the form is missing from its walk
   * too, and the absence reads as nothing to check.
   *
   * **Counted over the forms a card names, not over `forms`.** `ALL_FIELDS`
   * holds every field and no card reaches it, so a field sitting only there
   * is served by this document and drawn by nothing -- which is the state
   * being tested for, and `complianceFieldNames()` would report it as served.
   */
  it('draws every field the schema declares a control for', () => {
    const drawn = new Set(
      COMPLIANCE.cards
        .flatMap((card) => [card.form, card.form_off])
        .filter((form): form is string => form !== null)
        .flatMap((form) => COMPLIANCE.forms[form]?.fields.map((one) => toCamel(one.name)) ?? []),
    )
    const unreachable = formSpec(caseComplianceSchema)
      .map((field) => field.name)
      .filter((name) => !drawn.has(name))

    expect(unreachable, 'these validate and store, and no card draws them').toEqual([])
  })

  /**
   * A picker offers the vocabulary it is drawn from, all of it, in its order.
   *
   * `vocabularies/compliance.ts` opens by saying it is the only copy, and this
   * document restated each DORA list in both places it builds a form. Three
   * copies agree until one is edited, and the one that reaches a regulator is
   * whichever the screen happened to send.
   *
   * **The order is asserted, not just the set.** These are pickers a regulator
   * reads back, and a list reordered between the two copies is a different
   * screen for the same field.
   *
   * **A computed field is not here**, and the case above is why: 4.3's terms
   * are the ones this case's own 4.2 causes offer, so a static list of all
   * eighteen would offer causes the case does not owe.
   */
  it('offers every term of the vocabulary each DORA picker draws from', () => {
    const owed: Record<string, readonly string[]> = {
      dora_root_cause_high: DORA_ROOT_CAUSE_HIGH,
      dora_root_cause_detailed: Object.values(DORA_ROOT_CAUSE_DETAILED).flat(),
    }

    const wrong: string[] = []
    for (const [name, form] of Object.entries(COMPLIANCE.forms)) {
      for (const field of form.fields) {
        const want = owed[field.name]
        if (!want) continue
        const got = field.options ?? []
        if (got.length !== want.length || got.some((term, at) => term !== want[at])) {
          wrong.push(`${name}.${field.name}: offers ${String(got.length)} of ${String(want.length)}`)
        }
      }
    }

    expect(wrong.sort(), 'a picker disagreeing with the only copy of its list').toEqual([])
  })
})
