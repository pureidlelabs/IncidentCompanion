import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { kbdKeyLabel } from '@/components/ui/kbd'

import { ChordKeys, type Chord } from './chord-keys'

/**
 * A shortcut's chords, as key caps.
 */
const meta = {
  title: 'Blocks/List/Chord keys',
  component: ChordKeys,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof ChordKeys>

export default meta
type Story = StoryObj<typeof meta>

/** A single key, no modifier: the shortest thing this draws. */
export const Single: Story = {
  name: 'One key',
  args: { chords: [{ key: '/' }] },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('/')).toBeVisible()
  },
}

/**
 * A key with the platform accelerator.
 */
export const WithModifier: Story = {
  name: 'A key with a modifier',
  args: { chords: [{ key: 'k', mod: true }] },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Mod+k')).toBeVisible()
    // Typed lower case, printed upper: a cap reads as the key, not the letter.
    await expect(canvas.getByText('K')).toBeVisible()
  },
}

/**
 * A shift-qualified chord, for a command that is not destructive but should
 * not fire by accident.
 */
export const WithShift: Story = {
  name: 'A key with shift',
  args: { chords: [{ key: 'q', shift: true }] },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Shift+q')).toBeVisible()
  },
}

/**
 * Both qualifiers, which is where the printing order matters.
 */
export const BothQualifiers: Story = {
  name: 'A modifier and shift together',
  args: { chords: [{ key: 'p', mod: true, shift: true }] },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByLabelText('Mod+Shift+p')).toBeVisible()

    // The caps in the order they are drawn, against what this platform prints
    // for each -- reading the glyphs directly would assert a Mac.
    const caps = [...canvasElement.querySelectorAll('[data-slot="kbd"]')].map((el) =>
      el.textContent.trim(),
    )
    await expect(caps).toEqual([kbdKeyLabel('mod'), kbdKeyLabel('shift'), 'P'])
  },
}

/**
 * A named key is left as it was written.
 */
export const ANamedKey: Story = {
  name: 'A key with a name rather than a letter',
  args: { chords: [{ key: 'Escape' }] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Escape')).toBeVisible()
    await expect(canvas.queryByText('ESCAPE')).not.toBeInTheDocument()
  },
}

/**
 * No shortcut at all draws nothing, rather than an empty group.
 */
export const Empty: Story = {
  name: 'No chord',
  args: { chords: [] },
  play: async ({ canvasElement }) => {
    // Nothing at all, not an empty wrapper: a caller listing commands leaves
    // no gap where a cap would be.
    await expect(canvasElement.querySelector('[data-slot="chord-keys"]')).toBeNull()
    await expect(canvasElement.querySelector('[data-slot="kbd"]')).toBeNull()
  },
}

const CHORDS: readonly Chord[] = [{ key: 'k', mod: true }, { key: '/' }, { key: 'q', shift: true }]

/**
 * Several chords on one command, which is what an alternative binding looks
 * like: either fires it.
 */
export const Several: Story = {
  name: 'Several chords',
  args: { chords: CHORDS },
  play: async ({ canvas, args }) => {
    for (const chord of args.chords) {
      const label = [chord.mod === true ? 'Mod' : '', chord.shift === true ? 'Shift' : '', chord.key]
        .filter(Boolean)
        .join('+')
      await expect(canvas.getByLabelText(label)).toBeVisible()
    }
  },
}
