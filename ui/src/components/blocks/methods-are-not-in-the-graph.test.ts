/**
 * That a method is not a node in the investigation graph.
 */
import { describe, expect, it } from 'vitest'

import { refDeclarations, refTargets, timelineListFields } from './graph-references'
import { isSection } from '@/api/specs'
import { specsFixture } from '@/fixtures/specs'

const declarations = refDeclarations(specsFixture)

describe('the investigation graph excludes methods', () => {
  /**
   * **The guard against a vacuous file.**
   */
  it('is served a method reference, so the exclusion is doing real work', () => {
    const served = Object.values(specsFixture.forms).some((form) =>
      form.fields.some((entry) => !isSection(entry) && entry.ref?.target === 'method'),
    )

    expect(served).toBe(true)
  })

  it('declares no edge into a method', () => {
    expect(declarations.filter((one) => one.target === 'method')).toEqual([])
  })

  /** Both spellings, because an exclusion by field name would catch one. */
  it('drops the scalar and the list alike', () => {
    const fields = declarations.map((one) => one.field)

    expect(fields).not.toContain('methodId')
    expect(fields).not.toContain('methodIds')
  })

  it('offers no method node kind, which is what threw', () => {
    expect([...refTargets(declarations).keys()]).not.toContain('method')
  })

  /**
   * The second consumer, and the one an exclusion applied later would miss:
   * `timelineListFields` throws on a served list reference it does not name.
   */
  it('leaves the timeline\u2019s list order complete rather than throwing', () => {
    expect(() => timelineListFields(declarations)).not.toThrow()
    expect(timelineListFields(declarations)).not.toContain('methodIds')
  })

  /** One target wide, not a filter that grew. */
  it('still declares every target the graph does draw', () => {
    const targets = [...refTargets(declarations).keys()].sort()

    expect(targets).toEqual(['account', 'cloud_app', 'evidence', 'malware', 'network', 'system'])
  })
})
