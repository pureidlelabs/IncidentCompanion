import type { Meta, StoryObj } from '@storybook/react-vite'
import { TokenFieldValue } from 'react-aria-components'
import { expect } from 'storybook/test'

import { Token, TokenField } from './token-field'

/** The segments a filled field starts from. Fixed, so the story never varies. */
const filled = new TokenFieldValue([
  { type: 'text', text: 'Correlate ' },
  { type: 'token', text: '@j.okonkwo' },
  { type: 'text', text: ' with ' },
  { type: 'token', text: '#initial-access' },
  { type: 'text', text: ' before the handover.' },
])

/**
 * A text box whose entries become inline tokens rather than staying plain text.
 *
 * **The value is a sequence of segments, not a string.** Each is either text or
 * a token, so a caller reads back which mentions a note carries without parsing
 * the prose for `@` and `#`. That is the difference from a `TextArea` with
 * markup in it.
 *
 * The caller renders each token: the child function receives a segment and
 * decides what a token looks like, so a mention and a tactic can differ.
 *
 * `allowsNewlines` turns it into a note box with a floor rather than a single
 * line.
 */
const meta = {
  title: 'Components/TokenField',
  component: TokenField,
  parameters: { layout: 'centered' },
  args: {
    label: 'Note',
    className: 'w-96',
    children: (segment: { text: string }) => <Token>{segment.text}</Token>,
  },
  render: (args) => <TokenField {...args} />,
} satisfies Meta<typeof TokenField>

export default meta
type Story = StoryObj<typeof meta>

/** Empty. Typed text stays text until something tokenises it. */
export const Default: Story = {
  args: { description: 'Mention an entity with @, a tactic with #.' },
  play: async ({ canvas, userEvent }) => {
    const box = canvas.getByRole('textbox', { name: 'Note' })
    await userEvent.type(box, 'plain words')

    // Text, and no token drawn for it: tokenising is the caller's business,
    // and a field that guessed would turn every `@` in a hostname into one.
    await expect(canvasTokens(box)).toHaveLength(0)
  },
}

/** Every token in the value, drawn by the caller's own child function. */
export const WithTokens: Story = {
  args: { defaultValue: filled },
  play: async ({ canvas }) => {
    const box = canvas.getByRole('textbox', { name: 'Note' })
    await expect(canvasTokens(box)).toHaveLength(2)
    await expect(box).toHaveTextContent('@j.okonkwo')
    await expect(box).toHaveTextContent('#initial-access')
  },
}

/**
 * Multi-line, which gives the box a floor of 96px so a note has somewhere to
 * go before it scrolls.
 */
export const MultiLine: Story = {
  args: { label: 'Analyst note', allowsNewlines: true, defaultValue: filled },
  play: async ({ canvas }) => {
    const box = canvas.getByRole('textbox', { name: 'Analyst note' })
    await expect(box.getBoundingClientRect().height).toBeGreaterThanOrEqual(96)
  },
}

/** Disabled. The tokens dim with the box, and nothing can be typed. */
export const Disabled: Story = {
  args: { isDisabled: true, defaultValue: filled },
  play: async ({ canvas, userEvent }) => {
    const box = canvas.getByRole('textbox', { name: 'Note' })
    await userEvent.type(box, 'more')
    await expect(box).toHaveTextContent('before the handover.')
    await expect(box).not.toHaveTextContent('more')
  },
}

/**
 * A note far longer than the box, with tokens throughout.
 *
 * The field scrolls rather than growing without limit, and the tokens stay on
 * the lines their text sits on rather than collecting at the top.
 */
export const LongNote: Story = {
  args: {
    label: 'Analyst note',
    allowsNewlines: true,
    defaultValue: new TokenFieldValue([
      ...Array.from({ length: 10 }, () => [
        { type: 'text' as const, text: 'The mailbox was read in bulk, and ' },
        { type: 'token' as const, text: '@j.okonkwo' },
        { type: 'text' as const, text: ' revoked the sessions. ' },
      ]).flat(),
    ]),
  },
}

/** Every token in a field, found by the slot the kit's `Token` carries. */
function canvasTokens(box: HTMLElement): Element[] {
  return [...box.querySelectorAll('[data-slot="token"]')]
}
