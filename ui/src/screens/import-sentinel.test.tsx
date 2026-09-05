/**
 * The importer's four phases, attacked rather than walked.
 *
 * What these cannot see: any of it against a live tenant. The screen holds
 * demo rows and no provider, which is the point - a live sign-in is
 * `msalTokenProvider`'s and is tested there.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  DEMO_CANDIDATES,
  DEMO_INCIDENTS,
  DEMO_SOURCES,
  ImportSentinelScreen,
} from './import-sentinel'

/** The rows the screen used to default to, now passed the way a container does. */
const SAMPLE = {
  sources: DEMO_SOURCES,
  incidents: DEMO_INCIDENTS,
  candidates: DEMO_CANDIDATES,
}

/** The primary in the wizard's action row, whatever it is labelled this phase. */
function primary(): HTMLElement {
  return screen.getByTestId('import-primary')
}

describe('the connect phase', () => {
  it('refuses the sign-in until both coordinates are filled', async () => {
    const user = userEvent.setup()
    render(<ImportSentinelScreen {...SAMPLE} connected />)

    expect(primary()).toHaveTextContent('Sign in')
    expect(primary()).toBeDisabled()

    await user.type(screen.getByLabelText(/Directory \(tenant\) ID/), 'contoso.example')
    // One of two is not both.
    expect(primary()).toBeDisabled()

    await user.type(screen.getByLabelText(/Application \(client\) ID/), 'a-guid')
    expect(primary()).toBeEnabled()
  })

  it('does not count whitespace as a client id', async () => {
    const user = userEvent.setup()
    render(<ImportSentinelScreen {...SAMPLE} connected />)

    await user.type(screen.getByLabelText(/Directory \(tenant\) ID/), 'contoso.example')
    await user.type(screen.getByLabelText(/Application \(client\) ID/), '   ')
    expect(primary()).toBeDisabled()
  })

  it('offers nothing to fill in on an install with no provider', () => {
    render(<ImportSentinelScreen {...SAMPLE} />)

    expect(screen.queryByLabelText(/Application \(client\) ID/)).toBeNull()
    expect(primary()).toBeDisabled()
  })

  it('will not reach the workspace phase without a sign-in', async () => {
    const user = userEvent.setup()
    render(<ImportSentinelScreen {...SAMPLE} connected />)

    // The whole of the refusal: the primary is the only way forward, and it
    // signs in rather than stepping.
    expect(primary()).toBeDisabled()
    await user.click(primary())
    expect(screen.getByLabelText(/Directory \(tenant\) ID/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Disconnect' })).toBeNull()
  })

  it('signs in and lands on the workspace phase', async () => {
    const user = userEvent.setup()
    render(<ImportSentinelScreen {...SAMPLE} connected identity="" />)

    await user.type(screen.getByLabelText(/Directory \(tenant\) ID/), 'contoso.example')
    await user.type(screen.getByLabelText(/Application \(client\) ID/), 'a-guid')
    await user.click(primary())

    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument()
  })

  it('puts the coordinates away once they are set, and gets them back', async () => {
    const user = userEvent.setup()
    render(<ImportSentinelScreen {...SAMPLE} connected identity="rin@contoso.example" />)

    // Configured and signed in: two opaque GUIDs are not what this step is
    // for any more.
    expect(screen.queryByLabelText(/Application \(client\) ID/)).toBeNull()
    expect(screen.getByText(/Signed in as rin@contoso.example/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Change' }))
    expect(screen.getByLabelText(/Application \(client\) ID/)).toBeInTheDocument()
  })

  it('does not offer the sign-in to somebody already signed in', async () => {
    const user = userEvent.setup()
    render(<ImportSentinelScreen {...SAMPLE} connected identity="rin@contoso.example" />)

    // "Signed in as rin" above a button reading "Sign in" is the screen
    // contradicting itself about the one thing this step is for.
    expect(primary()).toHaveTextContent('Continue')
    await user.click(primary())
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument()
  })
})

describe('disconnecting', () => {
  it('drops the session rather than only stepping back', async () => {
    const user = userEvent.setup()
    render(<ImportSentinelScreen {...SAMPLE} connected identity="rin@contoso.example" phase="source" />)

    await user.click(screen.getByRole('button', { name: 'Disconnect' }))

    // Back on connect, and not still claiming an account.
    expect(screen.queryByText(/Signed in as/)).toBeNull()
    expect(primary()).toHaveTextContent('Sign in')
  })
})

describe('the incident search', () => {
  const atIncidents = () =>
    render(<ImportSentinelScreen {...SAMPLE} connected identity="rin@contoso.example" phase="incidents" />)

  it('narrows on a title, and only once Search is pressed', async () => {
    const user = userEvent.setup()
    atIncidents()

    const before = screen.getAllByRole('row').length
    await user.type(screen.getByLabelText('Title'), 'ransomware')
    // Typing sends nothing: the real one composes an OData filter and queries
    // on Search, so a listing that narrows under the keyboard is a lie about
    // what the provider has been asked.
    expect(screen.getAllByRole('row')).toHaveLength(before)

    await user.click(screen.getByRole('button', { name: 'Search' }))
    const rows = screen.getAllByRole('row')
    expect(rows.length).toBeLessThan(before)
    expect(screen.getByText(/Ransomware deployment/)).toBeInTheDocument()
    expect(screen.queryByText(/Impossible travel/)).toBeNull()
  })

  it('matches a title whichever way the case falls', async () => {
    const user = userEvent.setup()
    atIncidents()

    // **Both sides, because lowering one of them looks like lowering both.**
    // A needle lowered against an untouched haystack matches `travel` inside
    // `Impossible travel` and misses `Ransomware` - so a test that only ever
    // typed a word the row spells in lower case would pass on half the fix.
    await user.type(screen.getByLabelText('Title'), 'RANSOMWARE')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(screen.getByText(/Ransomware deployment/)).toBeInTheDocument()
  })

  it('matches a title inside the string, not only at its start', async () => {
    const user = userEvent.setup()
    atIncidents()

    await user.type(screen.getByLabelText('Title'), 'travel')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(screen.getByText(/Impossible travel/)).toBeInTheDocument()
  })

  it('says an empty listing is empty rather than drawing a headerless table', async () => {
    const user = userEvent.setup()
    atIncidents()

    await user.type(screen.getByLabelText('Title'), 'no incident says this')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(screen.getByText('Nothing in that window')).toBeInTheDocument()
  })

  it('refuses a non-numeric incident id out loud, and filters nothing away', async () => {
    const user = userEvent.setup()
    atIncidents()

    const before = screen.getAllByRole('row').length
    await user.type(screen.getByLabelText('Incident ID'), 'INC-88214')
    await user.click(screen.getByRole('button', { name: 'Search' }))

    // Sentinel rejects the whole query on one, so the filter is dropped and
    // said out loud. A silently empty table would read as "no such incident".
    expect(screen.getByText(/must be a number/)).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(before)
  })

  it('matches an incident id on the number, not on the label', async () => {
    const user = userEvent.setup()
    atIncidents()

    await user.type(screen.getByLabelText('Incident ID'), '88214')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(screen.getAllByRole('row')).toHaveLength(2) // header and one
    expect(screen.getByText(/Ransomware deployment/)).toBeInTheDocument()
  })
})

describe('the Created column', () => {
  it('sorts by the date and not by the order the rows arrived', async () => {
    const user = userEvent.setup()
    render(<ImportSentinelScreen {...SAMPLE} connected identity="rin@contoso.example" phase="incidents" />)

    const created = () =>
      screen
        .getAllByRole('row')
        .slice(1)
        .map((row) => within(row).getAllByRole('gridcell').at(-1)?.textContent ?? '')

    // Newest first is the shift an analyst comes in on - and the demo rows
    // are deliberately not in date order, so a sort that returned the array
    // it was handed would not produce this.
    const opening = created()
    expect(opening).toEqual([...opening].sort().reverse())
    expect(opening).not.toEqual(DEMO_INCIDENTS.map((one) => one.created))

    await user.click(screen.getByRole('button', { name: /Created/ }))
    expect(created()).not.toEqual(opening)
  })
})

describe('the per-incident checkboxes', () => {
  const atIncidents = () =>
    render(<ImportSentinelScreen {...SAMPLE} connected identity="rin@contoso.example" phase="incidents" />)

  it('refuses the fetch while nothing is ticked', () => {
    atIncidents()
    expect(primary()).toHaveTextContent('Fetch detail')
    expect(primary()).toBeDisabled()
  })

  it('counts what is ticked, and lets the fetch through', async () => {
    const user = userEvent.setup()
    atIncidents()

    await user.click(screen.getByRole('checkbox', { name: 'Import incident INC-88214' }))
    expect(screen.getByText(/1 selected/)).toBeInTheDocument()
    expect(primary()).toBeEnabled()
  })

  it('carries only the ticked incidents into the review', async () => {
    const user = userEvent.setup()
    atIncidents()

    await user.click(screen.getByRole('checkbox', { name: 'Import incident INC-88214' }))
    await user.click(primary())

    // INC-88155 has demo candidates too, and it was not ticked.
    expect(screen.getByText('INC-88214')).toBeInTheDocument()
    expect(screen.queryByText('INC-88155')).toBeNull()
    expect(primary()).toHaveTextContent('Import 4 row(s)')
  })

  it('gives every row its own box, and counts all of them', async () => {
    const user = userEvent.setup()
    atIncidents()

    const boxes = screen.getAllByRole('checkbox', { name: /^Import incident/ })
    expect(boxes).toHaveLength(DEMO_INCIDENTS.length)
    for (const box of boxes) await user.click(box)
    expect(
      screen.getByText(new RegExp(`${String(DEMO_INCIDENTS.length)} selected`)),
    ).toBeInTheDocument()
  })
})

describe('the import', () => {
  it('is refused when the review approves nothing', () => {
    render(
      <ImportSentinelScreen
        {...SAMPLE}
        connected
        identity="rin@contoso.example"
        phase="review"
        selected={[]}
      />,
    )
    expect(screen.getByText('Nothing to add')).toBeInTheDocument()
    expect(primary()).toBeDisabled()
  })

  it('says what it wrote rather than leaving the review on screen', async () => {
    const user = userEvent.setup()
    render(<ImportSentinelScreen {...SAMPLE} connected identity="rin@contoso.example" phase="review" />)

    expect(primary()).toHaveTextContent('Import 6 row(s)')
    await user.click(primary())

    expect(screen.getByText(/6 row\(s\) added to the case/)).toBeInTheDocument()
    // Pressing it twice would write twice.
    expect(primary()).toBeDisabled()
  })
})

/**
 * The shape the container hands it, which nothing else in this file uses.
 */
describe('the shape the container passes', () => {
  it('survives a re-render when the caller passes no rows', () => {
    // Two elements rather than one reused: React bails out of a re-render given
    // the identical element, so passing the same one back tests nothing.
    const { rerender } = render(
      <ImportSentinelScreen connected preconfigured writes={{} as never} />,
    )

    rerender(<ImportSentinelScreen connected preconfigured writes={{} as never} />)

    expect(primary()).toBeInTheDocument()
  })
})
