import type { Meta, StoryObj } from '@storybook/react-vite'
import { ShieldAlert } from 'lucide-react'
import { expect } from 'storybook/test'

import { refOptions } from '@/api/refOptions'
import { fieldsOf, formSpec, sectionsOf, type FieldSpec } from '@/api/specs'
import { FieldControl } from '@/components/blocks/field-control'
import { FieldRow, summarise } from '@/components/blocks/field-row'
import {
  FoldedGroups,
  FormCell,
  FormSection,
  spansRow,
} from '@/components/blocks/form-section'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

type Row = Record<string, unknown>

const SYSTEMS = refOptions(campaignCase.systems, (row) => row.hostname)
const system = campaignCase.systems[0]! as unknown as Row
const systemForm = formSpec<Row>(specsFixture, 'SYSTEM_FIELDS')
const impactForm = formSpec<Row>(specsFixture, 'IMPACT_FIELDS')

const IMPACT: Row = {
  subjectCount: 4200,
  recordCount: 18400,
  volumeBytes: 2147483648,
  notes: 'Counts are the export job\u2019s own totals, not a sample.',
}

/** One served field as a control, in whichever cell its kind asks for. */
function Cell({ field, draft }: { field: FieldSpec<Row>; draft: Row }) {
  return (
    <FormCell span={spansRow(field) ? 'row' : 'cell'}>
      <FieldControl<Row>
        field={field}
        draft={draft}
        refused={{}}
        advice={{}}
        optionsFor={() => SYSTEMS}
        suggestions={undefined}
        onSet={() => undefined}
        onLeave={() => undefined}
      />
    </FormCell>
  )
}

/** A run of served fields, by name, from one form. */
function Fields({
  form,
  names,
  draft,
}: {
  form: typeof systemForm
  names: readonly string[]
  draft: Row
}) {
  const wanted = new Set(names)
  return (
    <>
      {fieldsOf(form)
        .filter((field) => wanted.has(field.name))
        .map((field) => (
          <Cell key={field.name} field={field} draft={draft} />
        ))}
    </>
  )
}

/**
 * `FormSection` on the React Aria kit: the grid, the plate, the fold on the
 * heading row, and the band of compact rows a run of all-optional groups
 * collapses into.
 *
 * The controls are served fields drawn through `FieldControl`, so a column
 * holds what a form column actually holds.
 */
const meta = {
  title: 'Blocks/Form/Form section',
  component: FormSection,
  parameters: { layout: 'padded' },
  args: { title: 'Scale' },
} satisfies Meta<typeof FormSection>

export default meta
type Story = StoryObj<typeof meta>

/**
 * How many columns the cells are actually drawn in, read off the page.
 *
 * The class says what was asked for; this says what happened, which is the
 * only thing a reader of the grid can see.
 */
function columnsDrawn(root: HTMLElement): number {
  const cells = [...root.querySelectorAll('[data-slot="form-cell"][data-span="cell"]')]
  const tops = new Set(cells.map((cell) => Math.round(cell.getBoundingClientRect().top)))
  const firstRow = [...tops].sort((a, b) => a - b)[0]
  return cells.filter((cell) => Math.round(cell.getBoundingClientRect().top) === firstRow).length
}


/**
 * Three across, which is what a group of short numeric fields wants.
 *
 * The grid is the section's; a field asking for the whole measure says so
 * through its own cell rather than the section counting its kinds.
 */
export const ThreeColumns: Story = {
  name: 'Three columns',
  play: async ({ canvasElement }) => {
    await expect(columnsDrawn(canvasElement)).toBe(3)
  },
  args: {
    detail: 'What the incident reached, as far as it is known.',
    children: (
      <Fields
        form={impactForm}
        names={['subjectCount', 'recordCount', 'volumeBytes']}
        draft={IMPACT}
      />
    ),
  },
}

/**
 * Two across, with a chip on the heading saying how much of the group is
 * answered.
 */
export const TwoColumnsWithAChip: Story = {
  name: 'Two columns, with a chip',
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText('1 of 4')).toBeVisible()
    await expect(columnsDrawn(canvasElement)).toBe(2)
  },
  args: {
    columns: 2,
    chip: '1 of 4',
    // Three cells, not two: with two there is no wrap to see, and a
    // three-column grid draws them identically.
    children: (
      <Fields form={systemForm} names={['verdict', 'analysisStatus', 'zone']} draft={system} />
    ),
  },
}

/**
 * A textarea takes the whole measure through `FormCell span="row"`, so the
 * fields after it start a fresh row rather than wrapping around it.
 */
export const AFieldSpanningTheRow: Story = {
  name: 'A field taking the whole measure',
  play: async ({ canvasElement }) => {
    const grid = canvasElement.querySelector('[data-slot="form-grid"]')!
    const row = canvasElement.querySelector('[data-slot="form-cell"][data-span="row"]')!

    // A textarea asks for the row, so its cell is as wide as the grid and the
    // two numeric fields before it share the line above.
    await expect(row.getBoundingClientRect().width).toBeCloseTo(
      grid.getBoundingClientRect().width,
      0,
    )
    await expect(columnsDrawn(canvasElement)).toBe(2)
  },
  args: {
    title: 'Scale',
    columns: 2,
    children: (
      <Fields
        form={impactForm}
        names={['subjectCount', 'recordCount', 'notes']}
        draft={IMPACT}
      />
    ),
  },
}

/**
 * The identity plate: named for a screen reader, unheaded on screen.
 *
 * A plate is bounded by its own edge, so it draws no rule under a heading it
 * is not showing.
 */
export const Plate: Story = {
  name: 'The identity plate \u2014 named, unheaded',
  play: async ({ canvas, canvasElement }) => {
    // Named without a visible heading.
    const plate = canvas.getByLabelText('Identity')
    await expect(plate).toBeInTheDocument()
    await expect(canvas.queryByRole('heading', { name: 'Identity' })).not.toBeInTheDocument()

    // Raised ground of its own...
    const ground = getComputedStyle(plate).backgroundColor
    await expect(ground).not.toBe('rgba(0, 0, 0, 0)')
    await expect(Number.parseFloat(getComputedStyle(plate).borderTopWidth)).toBeGreaterThan(0)

    // Nothing to head: the plate is named without drawing a title.
    await expect(canvasElement.querySelector('h3, h2')).toBeNull()
  },
  args: {
    title: 'Identity',
    hideTitle: true,
    tone: 'plate',
    layout: 'plain',
    children: (
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <Fields form={systemForm} names={['hostname']} draft={system} />
        </div>
        <div className="flex-1">
          <Fields form={systemForm} names={['systemType']} draft={system} />
        </div>
      </div>
    ),
  },
}

/** A glyph tile beside the heading, for a group a reader scans down to. */
export const WithAnIcon: Story = {
  name: 'With a glyph tile',
  args: {
    title: 'Mitigation',
    icon: ShieldAlert,
    columns: 2,
    children: <Fields form={systemForm} names={['isolated', 'isolatedAt']} draft={system} />,
  },
}

/**
 * A fold says how much is behind it before it is opened.
 *
 * `4 of 5` is the reason to open it or leave it: a disclosure naming only
 * itself makes the analyst open every group to find the one holding something.
 */
export const Folded: Story = {
  name: 'A fold naming what is behind it',
  play: async ({ canvasElement }) => {
    // The group holds a select above the fold, so the fold is found by the
    // marker it carries rather than by being the only button.
    const fold = canvasElement.querySelector('[data-fold="Classification"]')!
    await expect(fold).toHaveAttribute('aria-expanded', 'false')
    await expect(fold).toHaveTextContent('4')
  },
  args: {
    title: 'Classification',
    columns: 2,
    foldCount: { total: 5, set: 4 },
    children: <Fields form={systemForm} names={['verdict']} draft={system} />,
    folded: (
      <Fields
        form={systemForm}
        names={['systemType', 'analysisStatus', 'zone', 'analyst', 'tags']}
        draft={system}
      />
    ),
  },
}

/**
 * The same fold, opened, which is how an edit arrives on a group already
 * holding a value.
 */
export const FoldOpen: Story = {
  name: 'The same fold, opened',
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelector('[data-fold="Classification"]'),
    ).toHaveAttribute('aria-expanded', 'true')
  },
  args: {
    title: 'Classification',
    columns: 2,
    foldOpen: true,
    foldCount: { total: 5, set: 4 },
    children: <Fields form={systemForm} names={['verdict']} draft={system} />,
    folded: (
      <Fields
        form={systemForm}
        names={['systemType', 'analysisStatus', 'zone', 'analyst', 'tags']}
        draft={system}
      />
    ),
  },
}

/** A fold that opens into disclosed rows rather than into a grid of controls. */
export const FoldedIntoRows: Story = {
  name: 'A fold opening into rows',
  args: {
    title: 'Classification',
    foldedAsRows: true,
    foldOpen: true,
    foldCount: { total: 5, set: 4 },
    folded: (
      <>
        {fieldsOf(systemForm)
          .filter((field) => field.subordinate === true)
          .map((field) => {
            const { summary, filled } = summarise<Row>(field, system[field.name], (id) =>
              SYSTEMS.get(id),
            )
            return (
              <FieldRow key={field.name} label={field.label} summary={summary} filled={filled}>
                <FieldControl<Row>
                  field={field}
                  draft={system}
                  refused={{}}
                  advice={{}}
                  optionsFor={() => SYSTEMS}
                  suggestions={undefined}
                  bare
                  onSet={() => undefined}
                  onLeave={() => undefined}
                />
              </FieldRow>
            )
          })}
      </>
    ),
  },
}

/** A group with nothing above its fold draws a heading, a control, and no grid. */
export const NothingAboveTheFold: Story = {
  name: 'Nothing above the fold',
  args: {
    title: 'Mitigation',
    columns: 2,
    foldCount: { total: 3, set: 0 },
    folded: <Fields form={systemForm} names={['isolated', 'isolatedAt', 'tags']} draft={{}} />,
  },
}

/** An empty title renders a `div` and no heading at all. */
export const Unnamed: Story = {
  name: 'An unnamed run',
  args: {
    title: '',
    columns: 2,
    children: <Fields form={systemForm} names={['analyst', 'analysisStatus']} draft={system} />,
  },
}

/**
 * A run of all-optional groups collapses into one band of compact rows.
 *
 * Three headings each over an empty grid is three rules and no content; as
 * rows they read as a list of things not yet answered.
 */
export const ABandOfCompactRows: Story = {
  name: 'A band of compact rows',
  render: () => (
    <FoldedGroups>
      {['Notification', 'Insurance', 'Legal hold'].map((title) => (
        <FormSection
          key={title}
          title={title}
          compact
          columns={2}
          foldCount={{ total: 3, set: 0 }}
          folded={<Fields form={systemForm} names={['analyst', 'tags', 'zone']} draft={{}} />}
        />
      ))}
    </FoldedGroups>
  ),
}

/**
 * The served form's own grouping: the run before the first marker, then one
 * section per marker with the copy the server sends.
 */
export const AServedForm: Story = {
  name: 'A served form, section by section',
  render: () => (
    <div className="flex flex-col gap-6">
      {sectionsOf(systemForm).map((section, index) => (
        <FormSection
          key={section.title === '' ? `run-${String(index)}` : section.title}
          title={section.title}
          columns={2}
          {...(section.copy === undefined ? {} : { detail: section.copy })}
        >
          {section.fields.map((field) => (
            <Cell key={field.name} field={field} draft={system} />
          ))}
        </FormSection>
      ))}
    </div>
  ),
}

/**
 * A plate that does show its heading draws no rule under it.
 *
 * A rule under a heading separates it from the group; a plate is already
 * bounded by its own edge, so the rule would be a second boundary a few
 * pixels inside the first.
 */
export const PlateWithAHeading: Story = {
  name: 'A plate keeping its heading',
  args: {
    title: 'Identity',
    tone: 'plate',
    columns: 2,
    children: <Fields form={systemForm} names={['hostname', 'systemType']} draft={system} />,
  },
  play: async ({ canvas, canvasElement }) => {
    const heading = canvas.getByText('Identity')
    await expect(heading).toBeVisible()

    // Nothing between the plate's edge and its grid carries a rule. Walked
    // rather than guessed at: the class sits on a wrapper `closest` does not
    // reach from the heading's own element.
    const plateEl = canvasElement.querySelector('[aria-label="Identity"]')!
    for (const child of plateEl.children) {
      await expect(getComputedStyle(child).borderBottomWidth).toBe('0px')
    }
    await expect(heading.textContent).toBe('Identity')

    // And the plate around it still has its edge.
    const plate = canvasElement.querySelector('[aria-label="Identity"]')!
    await expect(Number.parseFloat(getComputedStyle(plate).borderBottomWidth)).toBeGreaterThan(0)
  },
}

/**
 * Every field a served form carries, in one section.
 *
 * A form nobody split into groups is the volume this block is asked to hold,
 * and the grid is what has to survive it: the cells stay in their columns and
 * nothing runs past the width the section was given.
 */
export const TooMuchData: Story = {
  name: 'Every field of a form, ungrouped',
  args: {
    title: 'Systems',
    columns: 2,
    children: (
      <>
        {fieldsOf(systemForm).map((field) => (
          <Cell key={field.name} field={field} draft={system} />
        ))}
      </>
    ),
  },
  render: (args) => (
    <div style={{ width: 720 }} data-testid="bounded">
      <FormSection {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const bound = canvasElement
      .querySelector('[data-testid="bounded"]')!
      .getBoundingClientRect()
    const cells = [...canvasElement.querySelectorAll('[data-slot="form-cell"]')]

    // A form worth calling a volume, not three fields called one.
    await expect(cells.length).toBeGreaterThan(8)
    await expect(columnsDrawn(canvasElement)).toBe(2)

    // Nothing runs past the measure the section was handed.
    for (const cell of cells) {
      await expect(cell.getBoundingClientRect().right).toBeLessThanOrEqual(bound.right + 1)
    }

    // No field here asks for the whole row -- this form carries none that do,
    // and `AFieldSpanningTheRow` is where that is read.
  },
}
