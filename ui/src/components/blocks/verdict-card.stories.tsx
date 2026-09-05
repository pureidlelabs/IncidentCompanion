import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import type { ComplianceVerdict } from '@/api/compliance'

import { VerdictCard, VerdictChip } from './verdict-card'

/**
 * One regime's answer on this case, and what it was reached from.
 */
const meta = {
  title: 'Blocks/Card/Verdict',
  component: VerdictCard,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof VerdictCard>

export default meta
type Story = StoryObj<typeof meta>

const GDPR: ComplianceVerdict = {
  regime: 'GDPR',
  article: 'Art. 33',
  verdict: true,
  rule: 'A personal data breach likely to result in a risk must be notified within 72 hours.',
  detail: 'Personal data of EU residents was exfiltrated and the controller is established in the EU.',
  readiness: 'The 72-hour clock started at the confirmed exfiltration, not at detection.',
  criteria: [
    { label: 'Personal data involved', article: 'Art. 4(1)', met: true, detail: 'Customer master table, 41k rows.' },
    { label: 'Risk to rights and freedoms', article: 'Art. 33(1)', met: true, detail: 'Names with bank details.' },
    { label: 'Controller established in the EU', article: 'Art. 3(1)', met: true, detail: 'Registered in Utrecht.' },
  ],
}

/** The one that starts a clock, and the only kind that takes the solid chip. */
export const Reportable: Story = {
  name: 'Reportable',
  args: { verdict: GDPR },
  play: async ({ args, canvas }) => {
    // The criteria are the point, not the verdict: an analyst who disagrees
    // with the answer needs the clause that produced it, so a card listing
    // some of them is worse than one listing none -- it reads complete.
    await expect(canvas.getAllByRole('listitem')).toHaveLength(args.verdict.criteria.length)

    for (const criterion of args.verdict.criteria) {
      // Substring rather than a regex: an article number carries brackets,
      // which a regex reads as a group and matches nothing.
      await expect(canvas.getByText(criterion.article, { exact: false })).toBeVisible()
    }

    // The mark is a letter and the screen reader hears the word, so the state
    // survives greyscale print and a red/green deficiency alike.
    // Trailing space and all: the mark reads as "met: <clause>" to a screen
    // reader, and testing-library normalises whitespace, so it is matched on
    // the word rather than on the exact string.
    await expect(canvas.getAllByText('met:')).toHaveLength(args.verdict.criteria.length)
  },
}

/** A regime that looked and answered no. The criteria say which clause failed. */
export const NotReportable: Story = {
  name: 'Not reportable',
  args: {
    verdict: {
      ...GDPR,
      regime: 'NIS2',
      article: 'Art. 23',
      verdict: false,
      detail: 'The entity is not in scope: below the size threshold and not a listed sector.',
      readiness: '',
      criteria: [
        { label: 'Essential or important entity', article: 'Annex I', met: false, detail: 'Not a listed sector.' },
        { label: 'Significant incident', article: 'Art. 23(3)', met: true, detail: 'Service interruption over 24h.' },
      ],
    },
  },
}

/**
 * Not yet answered, which is not the same as answered no.
 */
export const Undetermined: Story = {
  name: 'Undetermined',
  args: {
    verdict: {
      ...GDPR,
      verdict: null,
      detail: 'Whether the exported rows carried personal data is still being established.',
      readiness: '',
      criteria: [
        { label: 'Personal data involved', article: 'Art. 4(1)', met: null, detail: 'Export contents not yet read.' },
      ],
    },
  },
}

/** Bare, with no criteria and no readiness -- the card still has to hold shape. */
export const Minimal: Story = {
  name: 'Nothing but the verdict',
  args: {
    verdict: { ...GDPR, detail: '', readiness: '', criteria: [] },
  },
}

/**
 * The three chips together, which is the comparison the vocabulary needs.
 */
export const EveryChip: Story = {
  name: 'Every verdict',
  args: { verdict: GDPR },
  render: ({ verdict }) => (
    <div className="flex gap-2">
      <VerdictChip verdict={verdict.verdict} />
      <VerdictChip verdict={false} />
      <VerdictChip verdict={null} />
    </div>
  ),
  play: async ({ canvas, step }) => {
    await step('each answer is a word rather than a colour alone', async () => {
      await expect(canvas.getByText('Reportable')).toBeVisible()
      await expect(canvas.getByText('Not reportable')).toBeVisible()
      await expect(canvas.getByText('Undetermined')).toBeVisible()
    })
  },
}
