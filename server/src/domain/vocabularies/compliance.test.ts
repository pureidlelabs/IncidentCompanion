import { describe, expect, it } from 'vitest'

import {
  DORA_ROOT_CAUSE_ADDITIONAL,
  DORA_ROOT_CAUSE_DETAILED,
  DORA_ROOT_CAUSE_HIGH,
  RSIT_CLASSES,
  RSIT_TYPES,
} from './compliance.js'

/**
 * A dependent vocabulary is a map keyed by the term that offers its branch,
 * and nothing but this holds the key to the term.
 *
 * **A key that names no term is a branch nobody can reach**, and it is silent:
 * the terms inside it are real, the enum built over the union accepts them,
 * and a consumer resolving the next level by what the analyst picked simply
 * finds nothing. It reads as a level with no answers rather than as a defect.
 *
 * **Both directions, because they fail differently.** A key naming no term
 * strands the terms under it; a term with no key offers the analyst a choice
 * that leads nowhere. Each is one half of the same disagreement.
 *
 * These reach a regulator's report, so the pairing is not cosmetic: a DORA
 * Art 4.2 detailed cause filed under a high-level cause that does not offer it
 * is a wrong filing.
 */
describe('a dependent compliance vocabulary', () => {
  it('keys the DORA detailed causes by the high-level causes that offer them', () => {
    const high: readonly string[] = DORA_ROOT_CAUSE_HIGH
    const keys = Object.keys(DORA_ROOT_CAUSE_DETAILED)

    expect(
      keys.filter((key) => !high.includes(key)),
      'these key a branch no high-level cause names',
    ).toEqual([])
    expect(
      high.filter((term) => !keys.includes(term)),
      'these are offered and open onto no detailed cause',
    ).toEqual([])
  })

  it('keys the DORA additional causes by the detailed causes that offer them', () => {
    const detailed = new Set<string>(Object.values(DORA_ROOT_CAUSE_DETAILED).flat())

    expect(
      Object.keys(DORA_ROOT_CAUSE_ADDITIONAL).filter((key) => !detailed.has(key)),
      'these key a branch no detailed cause names',
    ).toEqual([])
  })

  it('keys the RSIT types by the classes that offer them', () => {
    const classes = RSIT_CLASSES.map((one) => one.value)
    const keys = Object.keys(RSIT_TYPES)

    expect(
      keys.filter((key) => !(classes as readonly string[]).includes(key)),
      'these key a branch no class names',
    ).toEqual([])
    expect(
      classes.filter((value) => !keys.includes(value)),
      'these are offered and open onto no type',
    ).toEqual([])
  })
})
