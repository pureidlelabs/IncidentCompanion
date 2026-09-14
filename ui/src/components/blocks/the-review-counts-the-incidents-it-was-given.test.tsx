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
        candidates={[row('a', 'incident-1'), row('b', 'incident-1'), row('c', 'incident-2')]}
        chosen={4}
        onApproved={() => undefined}
      />,
    )

    expect(
      said(),
      'the line took its count off the rows, so it reports 3 or 2 -- both of which are ' +
        'true about something other than what the analyst chose',
    ).toContain('from 4 incidents')
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
    ).toContain('2 incidents added nothing of their own.')
  })

  /**
   * **The singular is the headline case, not an edge one.** #605 is written
   * around two incidents naming one host, which leaves exactly one silent.
   * The line is announced, so a hard-plural possessive is read out loud.
   */
  it('agrees with itself about one', () => {
    render(
      <ProviderImportReview
        candidates={[row('a', 'incident-1')]}
        chosen={2}
        onApproved={() => undefined}
      />,
    )

    expect(said()).toContain('1 incident added nothing of its own.')
  })

  /**
   * **Every incident silent is the same defect at the count where the table
   * disappears.** The screen then asserted a reason it cannot know -- that
   * every row is already in the case -- where an incident carrying only
   * unsupported kinds produces no candidate at all.
   */
  it('says the same thing when no incident produced a row', () => {
    render(<ProviderImportReview candidates={[]} chosen={2} onApproved={() => undefined} />)

    expect(
      screen.getByText(/added nothing/),
      'the empty screen names a cause of its own instead of what the import did',
    ).toBeDefined()
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
