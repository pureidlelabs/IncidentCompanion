import { describe, expect, it } from 'vitest'

import { specsFixture } from '@/fixtures/specs'

import { SEVERITY_TONE } from './graph-tones'

/**
 * The canvas paints a node's severity through `SEVERITY_TONE`, and nothing else
 * on that screen can be tested: `cytoscape()` throws under jsdom, so `paint()`
 * never runs and every assertion in `InvestigationGraphSection.test.tsx` lands
 * against an empty host. This file holds the one decision that does not need
 * the drawing.
 */
describe('the canvas severity tones', () => {
  it('has a tone for every severity the server serves', () => {
    // A map of `high, medium, low, info` misses what the server serves:
    // `critical` and `informational` fall through to `none`, so the most severe
    // node on the graph draws the unknown grey ring. No demo case or fixture
    // carries either value, so no screenshot shows it either.
    const served = specsFixture.vocabularies.severity ?? []
    expect(served.length).toBeGreaterThan(0)
    for (const severity of served) {
      expect(SEVERITY_TONE[severity], `${severity} has no tone`).toBeDefined()
      expect(SEVERITY_TONE[severity], `${severity} paints as unrated`).not.toBe('none')
    }
  })

  it('keeps critical and high apart from the middle of the scale', () => {
    // Four tone rungs against five severities, so the top two share `bad`.
    // What must not happen is either of them reading as a lesser rung.
    expect(SEVERITY_TONE.critical).toBe('bad')
    expect(SEVERITY_TONE.high).toBe('bad')
    expect(SEVERITY_TONE.medium).toBe('warn')
    expect(SEVERITY_TONE.low).toBe('good')
  })
})
