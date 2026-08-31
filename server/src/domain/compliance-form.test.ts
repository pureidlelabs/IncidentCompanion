/**
 * The Compliance screen's forms, against the table they write to.
 *
 * **The defect this is named for is a form that writes nothing.** The screen
 * draws whatever the specs document declares, so a control whose name has no
 * column looks identical to one that works - it accepts a value, posts it, and
 * the write path drops it as unknown. Measured while building this: the table
 * carried GDPR, DORA and the shared facts and **no NIS2 storage at all**, so
 * nine of the Findings card's ten controls would have been that.
 *
 * The declarations are generated, so these are assertions about the *lift*,
 * not about hand-written data: a Python-side rename lands here as a red test
 * rather than as a silently inert control.
 */
import { getTableColumns } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { caseCompliance } from '../db/schema/case-compliance.js'
import { COMPLIANCE, complianceFieldNames } from './compliance-form.js'

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
})
