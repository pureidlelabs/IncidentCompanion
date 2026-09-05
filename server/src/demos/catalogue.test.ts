/**
 * The demo table, checked against the schema that guards it.
 */
import { describe, expect, it } from 'vitest'

import { DEMO_CASES, demoCaseSchema } from './catalogue.js'

const A_DEMO = {
  reference: 'DEMO-2026-999',
  customer: 'Fictional Entity',
  title: 'A scenario',
  scenario: 'Phishing',
  scale: 'Small',
  glyph: 'mail',
  summary: 'Long enough to be a real card rather than a placeholder nobody filled in.',
}

describe('the demo definitions', () => {
  it('carries all six scenarios the product ships', () => {
    // Two were invented before anyone read `app/demo_cases/`. The count is the
    // cheapest thing that would have caught it.
    expect(DEMO_CASES).toHaveLength(6)
  })

  it('gives every demo a distinct reference', () => {
    const refs = DEMO_CASES.map((d) => d.reference)
    expect(new Set(refs).size).toBe(refs.length)
  })

  it('names an incident class that does not restate the scale', () => {
    // The two are separate fields on purpose: one says what kind of incident,
    // the other how big. A demo whose scenario is "Large" has lost that.
    const scales = new Set(DEMO_CASES.map((d) => d.scale.toLowerCase()))
    for (const demo of DEMO_CASES) {
      expect(scales.has(demo.scenario.toLowerCase()), demo.reference).toBe(false)
    }
  })
})

describe('the schema guarding them', () => {
  it('accepts a well-formed demo', () => {
    expect(demoCaseSchema.safeParse(A_DEMO).success).toBe(true)
  })

  it('refuses a demo with no summary, which is the card', () => {
    expect(demoCaseSchema.safeParse({ ...A_DEMO, summary: '' }).success).toBe(false)
  })

  it('refuses a placeholder summary too short to be real copy', () => {
    expect(demoCaseSchema.safeParse({ ...A_DEMO, summary: 'TODO' }).success).toBe(false)
  })

  it('refuses a stray field rather than dropping it', () => {
    // Strict, so a demo carrying a key the seeder does not map fails here
    // rather than being silently absent from every card.
    expect(demoCaseSchema.safeParse({ ...A_DEMO, scenarioName: 'x' }).success).toBe(false)
  })
})
