/**
 * That a method is not a node in the investigation graph.
 *
 * **The graph derives its node kinds from the served reference declarations**,
 * so declaring `methodId` on six schemas put a seventh target in front of it
 * with no describer and `entity-graph.ts` threw rather than drawing unlabelled
 * nodes. That loud refusal is correct, and the answer to it is not a describer.
 *
 * **The graph is the intrusion; a method is the analyst's working-out.** Hosts,
 * accounts, indicators, malware, cloud apps and evidence are things the
 * intruder touched or the case holds. How somebody came to know a thing is
 * provenance, and drawing it beside the attack puts the investigation's own
 * process into a picture of what happened.
 *
 * Written from the attack the exclusion invites: one by *field name* would
 * catch a single spelling, and one applied after `refDeclarations` would leave
 * the timeline's own list guard still seeing it.
 */
import { describe, expect, it } from 'vitest'

import { refDeclarations, refTargets, timelineListFields } from './graph-references'
import { isSection } from '@/api/specs'
import { specsFixture } from '@/fixtures/specs'

const declarations = refDeclarations(specsFixture)

describe('the investigation graph excludes methods', () => {
  /**
   * **The guard against a vacuous file.** Every assertion below passes on a
   * document that stopped declaring the field at all, which is the way an
   * exclusion test quietly stops covering its subject.
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
