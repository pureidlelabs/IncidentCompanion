import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DemosPane } from './demos-pane'
import { HealthPane } from './health-pane'

/**
 * **A pane draws the install it is given, not the one in the fixtures.**
 *
 * Both panes shipped with the fixture read directly and no prop to replace it,
 * so a container had nothing to hand them. Storybook was green throughout and
 * correctly so: the gallery is the one caller for which a hardcoded fixture
 * is the right answer, so no other instrument could see it.
 *
 * `HealthPane` is why this is a test rather than a note: it derives a serving
 * state from what it reads, so a pane ignoring its argument reports an outage
 * belonging to no install.
 */
describe('a pane draws what it is given', () => {
  it('renders the demo cases it is handed rather than the fixture', () => {
    render(
      <DemosPane
          href={(d) => `/cases/${d.id}/overview`}
        demos={[
          {
            id: 'seeded-one',
            title: 'An install that seeded exactly one',
            scenario: 'insider',
            scale: 'small',
            summary: 'The only case this install offers.',
          },
        ]}
      />,
    )

    expect(screen.getByText('An install that seeded exactly one')).toBeInTheDocument()
    expect(screen.queryByText('Worked ransomware campaign')).toBeNull()
  })

  it('says an install offers no demo cases when it offers none', () => {
    render(<DemosPane href={(d) => `/cases/${d.id}/overview`} demos={[]} />)

    expect(screen.getByText('This install offers no demo cases.')).toBeInTheDocument()
    expect(screen.queryByText('Worked ransomware campaign')).toBeNull()
  })

  it('reports the serving state it is handed rather than the fixture', () => {
    render(<HealthPane uptime={undefined} gauges={[]} connections={undefined} figures={[]} tables={[]} serving={[{ label: 'Redis', up: true, detail: 'answering' }]} />)

    expect(screen.getByText('Redis')).toBeInTheDocument()
    // The fixture carries Redis down, so the note renders unconditionally for
    // a pane that ignores its argument. An install where Redis answers must
    // not be told what stops when it does not.
    expect(screen.queryByText(/presence, claims and the live repaint/)).toBeNull()
  })

  it('still carries the outage note when the install it is given is down', () => {
    render(<HealthPane uptime={undefined} gauges={[]} connections={undefined} figures={[]} tables={[]} serving={[{ label: 'Redis', up: false, detail: 'refused' }]} />)

    expect(screen.getByText(/presence, claims and the live repaint/)).toBeInTheDocument()
  })
})
