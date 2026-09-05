/**
 * The derivation, attacked at the places the two models disagree.
 */
import { describe, expect, it } from 'vitest'

import { baseTechnique, ukcCycle, ukcPhase, UKC_IN, UKC_OUT, UKC_THROUGH } from './killchain.js'
import { TACTIC, UKC_PHASE } from './vocabularies.js'

describe('the phase an entry is placed in', () => {
  it('takes the tactic when nothing more specific is recorded', () => {
    expect(ukcPhase('exfiltration')).toBe('exfiltration')
    expect(ukcPhase('resource development')).toBe('weaponization')
  })

  /**
   * **The two published spellings, and neither is a typo.**
   */
  it('crosses the two vocabularies where they spell a phase differently', () => {
    expect(ukcPhase('command and control')).toBe('command & control')
    expect(UKC_PHASE).toContain('command & control')
    expect(TACTIC).toContain('command and control')
  })

  /**
   * **Initial Access is three phases and the technique decides which.**
   */
  it.each([
    ['T1566', 'social engineering'],
    ['T1190', 'exploitation'],
    ['T1189', 'exploitation'],
  ])('splits initial access by technique \u2014 %s is %s', (technique, phase) => {
    expect(ukcPhase('initial access', technique)).toBe(phase)
    // And the default is what it falls back to without one.
    expect(ukcPhase('initial access')).toBe('delivery')
  })

  it('folds a sub-technique to its parent', () => {
    expect(baseTechnique('T1566.001')).toBe('T1566')
    expect(ukcPhase('initial access', 'T1566.001')).toBe('social engineering')
    // Lower case and stray space, because a technique is typed by hand.
    expect(ukcPhase('initial access', ' t1566.002 ')).toBe('social engineering')
  })

  it('lets the analyst override the derivation outright', () => {
    expect(ukcPhase('exfiltration', '', 'objectives')).toBe('objectives')
    // Precedence: the override beats a technique that would say otherwise.
    expect(ukcPhase('initial access', 'T1566', 'policy violation')).toBe('policy violation')
  })

  it('refuses an override that is not a phase', () => {
    expect(ukcPhase('exfiltration', '', 'not a phase')).toBe('')
  })

  it('leaves an untagged entry out of the chain', () => {
    expect(ukcPhase('')).toBe('')
    expect(ukcPhase('', 'T9999')).toBe('')
  })

  /**
   * Every tactic derives to a real phase.
   */
  it.each(TACTIC.map((tactic) => [tactic]))('derives %s to a served phase', (tactic) => {
    const phase = ukcPhase(tactic)
    expect(phase, `${tactic} derives to nothing`).not.toBe('')
    expect(UKC_PHASE, `${tactic} derives to ${phase}, which is not a phase`).toContain(phase)
  })
})

describe('the cycle a phase sits in', () => {
  it.each([
    ['delivery', 'in'],
    ['lateral movement', 'through'],
    ['exfiltration', 'out'],
  ])('%s is %s', (phase, cycle) => {
    expect(ukcCycle(phase)).toBe(cycle)
  })

  it('gives policy violation no cycle', () => {
    expect(UKC_PHASE).toContain('policy violation')
    expect(ukcCycle('policy violation')).toBe('')
  })

  it('gives an untagged entry no cycle', () => {
    expect(ukcCycle('')).toBe('')
  })

  /**
   * The three lists partition the vocabulary, minus the one deliberate
   * exclusion.
   */
  it('covers every phase exactly once, apart from policy violation', () => {
    const assigned = [...UKC_IN, ...UKC_THROUGH, ...UKC_OUT]
    expect(new Set(assigned).size, 'a phase is in two cycles').toBe(assigned.length)

    const missing = UKC_PHASE.filter(
      (phase) => phase !== 'policy violation' && !assigned.includes(phase as never),
    )
    expect(missing, 'these phases sit in no cycle and vanish from the bands').toEqual([])

    const unknown = assigned.filter((phase) => !UKC_PHASE.includes(phase as never))
    expect(unknown, 'a cycle names a phase the vocabulary does not have').toEqual([])
  })
})
