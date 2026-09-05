/**
 * Where a visitor who typed the bare address ends up.
 *
 * The picker's default pane is `Your cases`, which hides demo cases - and the
 * only case here is one. Landing there shows `0 cases` and an empty state,
 * which is the first impression the evaluation capability exists to prevent.
 */
import { describe, expect, it } from 'vitest'

import { landingPath } from './landing'

const CASE = '1ee22e6d-bad8-4a5c-af69-25b2516a03e8'

describe('the path a visitor lands on', () => {
  it('sends the bare address into the case', () => {
    expect(landingPath('/', CASE, '/')).toBe(`/cases/${CASE}/timeline`)
  })

  it('leaves a shared deep link alone', () => {
    expect(landingPath(`/cases/${CASE}/evidence`, CASE, '/')).toBeNull()
  })

  it('leaves a screen the visitor navigated to alone', () => {
    expect(landingPath('/cases', CASE, '/')).toBeNull()
  })

  /** A published site under a path prefix, which is what Pages serves without a custom domain. */
  it('treats a base-prefixed root as the root', () => {
    expect(landingPath('/IncidentCompanion/', CASE, '/IncidentCompanion/')).toBe(
      `/IncidentCompanion/cases/${CASE}/timeline`,
    )
  })
})
