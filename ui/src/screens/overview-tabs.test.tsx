/**
 * The case overview's three tabs, and the flyout that draws one of them twice.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { fieldsOf, formSpec, type FieldSpec } from '@/api/specs'
import { CaseKeyTimesSheet } from '@/components/blocks/case-key-times-sheet'
import { groupedCaseFields } from '@/components/blocks/case-record-groups'
import { campaignCase } from '@/fixtures/campaign'
import { campaignCompliance } from '@/fixtures/compliance'
import { specsFixture } from '@/fixtures/specs'

import { OverviewScreen } from './overview'

/** A field on each pane that appears on no other, so a swap cannot pass. */
const ONLY_ON_PROPERTIES = 'Incident class'
const ONLY_ON_TIMES = 'Contained at'

const CASE_FIELDS = fieldsOf(formSpec(specsFixture, 'CASE_FIELDS'))

/** Every label the served case form carries, so nothing can quietly drop. */
const EVERY_LABEL = CASE_FIELDS.map((field) => field.label)

async function press(name: string): Promise<void> {
  const user = userEvent.setup()
  await user.click(screen.getByRole('tab', { name }))
}

describe('the tabs', () => {
  it('opens on the read pane, not on a form', () => {
    render(<OverviewScreen kase={campaignCase} specs={specsFixture} record={campaignCompliance} />)
    expect(screen.getByRole('region', { name: 'Open items' })).toBeInTheDocument()
    expect(screen.queryByLabelText(ONLY_ON_PROPERTIES)).toBeNull()
    expect(screen.queryByLabelText(ONLY_ON_TIMES)).toBeNull()
  })

  /**
   * The attack: a panel wired to the wrong tab id renders one of the forms
   * under both form tabs, and both tabs still open something.
   */
  it('draws the properties pane behind the properties tab and nothing else', async () => {
    render(<OverviewScreen kase={campaignCase} specs={specsFixture} record={campaignCompliance} />)
    await press('Properties')
    expect(screen.getByLabelText(ONLY_ON_PROPERTIES)).toBeInTheDocument()
    expect(screen.queryByLabelText(ONLY_ON_TIMES)).toBeNull()
    expect(screen.queryByRole('region', { name: 'Open items' })).toBeNull()
  })

  it('draws the key times pane behind the key times tab and nothing else', async () => {
    render(<OverviewScreen kase={campaignCase} specs={specsFixture} record={campaignCompliance} />)
    await press('Key times')
    expect(screen.getByLabelText(ONLY_ON_TIMES)).toBeInTheDocument()
    expect(screen.queryByLabelText(ONLY_ON_PROPERTIES)).toBeNull()
    expect(screen.queryByRole('region', { name: 'Open items' })).toBeNull()
  })

  /**
   * Case settings was deleted into these two tabs, so a field that reached
   * neither would be unanswerable with nothing on screen to say so.
   */
  it('leaves no served case field unreachable', async () => {
    render(<OverviewScreen kase={campaignCase} specs={specsFixture} record={campaignCompliance} />)
    await press('Properties')
    const onProperties = EVERY_LABEL.filter((label) => screen.queryByLabelText(label) !== null)
    await press('Key times')
    const onTimes = EVERY_LABEL.filter((label) => screen.queryByLabelText(label) !== null)

    const reached = new Set([...onProperties, ...onTimes])
    expect(EVERY_LABEL.filter((label) => !reached.has(label))).toEqual([])
  })
})

describe('the key times flyout', () => {
  /**
   * The whole reason both surfaces draw one block.
   */
  it('holds exactly the fields the key times tab holds', async () => {
    const user = userEvent.setup()

    const tab = render(<OverviewScreen kase={campaignCase} specs={specsFixture} record={campaignCompliance} />)
    await press('Key times')
    const onTab = EVERY_LABEL.filter((label) => screen.queryByLabelText(label) !== null)
    tab.unmount()

    render(<CaseKeyTimesSheet kase={campaignCase} specs={specsFixture} />)
    await user.click(screen.getByRole('button', { name: /Key times/ }))
    const panel = await screen.findByRole('dialog')
    const inPanel = EVERY_LABEL.filter(
      (label) => within(panel).queryByLabelText(label) !== null,
    )

    expect(inPanel.length).toBeGreaterThan(0)
    expect([...inPanel].sort()).toEqual([...onTab].sort())
  })

  /** Both surfaces name the same field, so a refusal reads the same in each. */
  it('names the field a refusal carries', () => {
    render(<CaseKeyTimesSheet isOpen refusal={{ field: 'Contained at', by: 'A. Okonkwo' }} />)
    expect(screen.getByText('Contained at was not saved')).toBeInTheDocument()
  })
})

describe('a refused write', () => {
  it('opens the tab holding the field it names', () => {
    render(<OverviewScreen kase={campaignCase} specs={specsFixture} record={campaignCompliance} refusal={{ field: 'Severity', by: 'A. Okonkwo' }} />)
    expect(screen.getByText('Severity was not saved')).toBeInTheDocument()
    expect(screen.getByLabelText(ONLY_ON_PROPERTIES)).toBeInTheDocument()
  })

  /**
   * A stamp is on the other tab, so a screen that always opened Properties
   * would pass the case above and strand this one.
   */
  it('opens the key times tab for a stamp', () => {
    render(<OverviewScreen kase={campaignCase} specs={specsFixture} record={campaignCompliance} refusal={{ field: 'Contained at', by: 'A. Okonkwo' }} />)
    expect(screen.getByText('Contained at was not saved')).toBeInTheDocument()
    expect(screen.getByLabelText(ONLY_ON_TIMES)).toBeInTheDocument()
  })

  /** A label neither pane recognises still has to be shown somewhere. */
  it('shows a refusal on a field it cannot place', () => {
    render(<OverviewScreen kase={campaignCase} specs={specsFixture} record={campaignCompliance} refusal={{ field: 'Some field nobody serves', by: 'A. Okonkwo' }} />)
    expect(screen.getByText('Some field nobody serves was not saved')).toBeInTheDocument()
  })

  /**
   * The refusal arrives with the repaint that caused it, and the screen was on
   * the read tab when it did.
   */
  it('moves to the tab when the refusal arrives after the screen was drawn', () => {
    const { rerender } = render(<OverviewScreen kase={campaignCase} specs={specsFixture} record={campaignCompliance} />)
    expect(screen.getByRole('region', { name: 'Open items' })).toBeInTheDocument()

    rerender(
      <OverviewScreen
        kase={{ ...campaignCase, severity: 'critical' }}
        specs={specsFixture}
        record={campaignCompliance}
        refusal={{ field: 'Severity', by: 'A. Okonkwo' }}
      />,
    )
    expect(screen.getByText('Severity was not saved')).toBeInTheDocument()
    expect(screen.getByLabelText(ONLY_ON_PROPERTIES)).toBeInTheDocument()
  })

  /** One band, not one per pane: a second copy reads as a second refusal. */
  it('draws the band once', () => {
    render(<OverviewScreen kase={campaignCase} specs={specsFixture} record={campaignCompliance} refusal={{ field: 'Severity', by: 'A. Okonkwo' }} />)
    expect(screen.getAllByText('Severity was not saved')).toHaveLength(1)
  })
})

describe('the record groups', () => {
  /**
   * A name in neither list keeps a place rather than disappearing, and the
   * pane it keeps has to be one a tab opens.
   */
  it('places every served field on a pane a tab draws', () => {
    const panes = groupedCaseFields(CASE_FIELDS)
    expect(panes.map((pane) => pane.key).sort()).toEqual(['details', 'times'])
    const placed = panes.flatMap((pane) => pane.fields.map((field) => field.name))
    expect(placed.sort()).toEqual(CASE_FIELDS.map((field) => field.name).sort())
  })

  /**
   * The served form names every field one of the two groups names, so the
   * leftover clause is unreachable from the fixture and a mutation to it stays
   * green.
   */
  it('places a field neither group names', () => {
    const invented = { name: 'noteworthiness', label: 'Noteworthiness', kind: 'text' } as FieldSpec
    const panes = groupedCaseFields([...CASE_FIELDS, invented])
    const details = panes.find((pane) => pane.key === 'details')
    expect(details?.fields.map((field) => field.name)).toContain('noteworthiness')
    expect(panes.map((pane) => pane.key)).toEqual(['details', 'times'])
  })
})
