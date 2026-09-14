/**
 * **The summary counts the incidents the analyst chose, not the ones that
 * produced a row.**
 *
 * The line is the confirmation that the import took what was selected, so
 * reading *from 1 incident* after choosing two is indistinguishable from the
 * second having failed to load -- which is a real state of this screen, and
 * the one an analyst would go looking for. -> #605
 *
 * **They differ for ordinary reasons, not exotic ones.** An incident whose
 * entities are all of an unsupported kind contributes nothing; so does one
 * naming only things another incident in the same import already named, which
 * is what #602 made possible by proposing each thing once.
 *
 * **What this does not cover:** what the screen does with an incident that
 * failed to load, which is `import-sentinel.tsx`'s and is a different state
 * from one that loaded and proposed nothing.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ProviderImportReview, type Candidate } from './provider-import-review'

const row = (id: string, incident: string): Candidate => ({
  id,
  incident,
  collection: 'systems',
  label: `host-${id}`,
  verdict: 'new',
  fields: 3,
  checked: true,
})

const said = () => screen.getByRole('status').textContent

describe('the import review summary', () => {
  it('counts the incidents it was given, not the ones that produced a row', () => {
    render(
      <ProviderImportReview
        candidates={[row('a', 'incident-1'), row('b', 'incident-1')]}
        chosen={2}
        onApproved={() => undefined}
      />,
    )

    expect(
      said(),
      'the second incident produced no row and the line reports it as not having been chosen',
    ).toContain('2 incidents')
  })

  it('says how many of them produced nothing of their own', () => {
    render(
      <ProviderImportReview
        candidates={[row('a', 'incident-1')]}
        chosen={3}
        onApproved={() => undefined}
      />,
    )

    expect(
      said(),
      'two chosen incidents added nothing and the line does not say so, which reads as a ' +
        'silent loss rather than a stated one',
    ).toMatch(/2 .*(nothing|no rows|added nothing)/i)
  })

  it('says nothing extra when every incident produced a row', () => {
    render(
      <ProviderImportReview
        candidates={[row('a', 'incident-1'), row('b', 'incident-2')]}
        chosen={2}
        onApproved={() => undefined}
      />,
    )

    const line = said()
    expect(line).toContain('2 incidents')
    expect(
      line,
      'a clean import carries a clause about nothing, which is noise on the ordinary case',
    ).not.toMatch(/nothing|no rows/i)
  })
})
