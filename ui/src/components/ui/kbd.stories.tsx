import type { Meta, StoryObj } from '@storybook/react-vite'
import { Fragment } from 'react'
import { expect } from 'storybook/test'

import { Kbd, KbdGroup } from './kbd'

/**
 * One key on a keyboard, as it appears in a shortcut. `KbdGroup` spaces a chord
 * and mutes the connectives between the caps.
 *
 * `children` prints a character literally. `keyName` names a modifier instead,
 * so it can be drawn per keyboard - a glyph on macOS, spelled out elsewhere.
 * Reach for `mod`, the platform's own accelerator, rather than `ctrl`: on a Mac
 * those are different keys, and shortcuts mean the first.
 *
 * `platform` overrides the browser's detection and exists so one page can show
 * both keyboards. Application code leaves it unset.
 *
 * Decoration: it is `pointer-events-none`, and a shortcut is bound by the
 * shortcut registry rather than by this.
 */
const meta = {
  title: 'Components/Kbd',
  component: Kbd,
  parameters: { layout: 'centered' },
  args: { children: 'K' },
  render: (args) => <Kbd {...args} />,
} satisfies Meta<typeof Kbd>

export default meta
type Story = StoryObj<typeof meta>

/** One key. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    // A `kbd` element, not a styled span: it is what says "this is a key" to
    // anything reading the page rather than looking at it.
    await expect(canvasElement.querySelector('kbd')).toHaveTextContent('K')
  },
}

/** Both sizes. `sm` is sized to sit in a line of body copy; `md` stands alone. */
export const Sizes: Story = {
  render: (args) => (
    <div className="flex items-center gap-3">
      <Kbd {...args} size="sm" />
      <Kbd {...args} size="md" />
    </div>
  ),
}

/**
 * A chord and a sequence.
 *
 * `KbdGroup` sets the spacing and the muted colour of the words between the
 * caps, so `+` and `then` read as connectives rather than as keys.
 */
export const Groups: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-3">
      <KbdGroup>
        <Kbd>Ctrl</Kbd>
        <span>+</span>
        <Kbd>K</Kbd>
      </KbdGroup>
      <KbdGroup>
        <Kbd>g</Kbd>
        <span>then</span>
        <Kbd>t</Kbd>
      </KbdGroup>
      <KbdGroup>
        <Kbd size="md">Shift</Kbd>
        <span>+</span>
        <Kbd size="md">Enter</Kbd>
      </KbdGroup>
    </div>
  ),
}

/** Inside a line of body copy, which is what `sm` is sized for. */
export const InText: Story = {
  render: () => (
    <p className="max-w-sm text-sm">
      Press <Kbd>Ctrl</Kbd> <Kbd>K</Kbd> to open the command palette, or <Kbd>Esc</Kbd> to close
      it.
    </p>
  ),
}

const NAMED_KEYS = [
  'mod',
  'ctrl',
  'alt',
  'shift',
  'enter',
  'backspace',
  'delete',
  'escape',
  'tab',
] as const

/**
 * **The named keys, both keyboards.**
 *
 * macOS prints its modifiers as glyphs and every other keyboard spells them, so
 * a shortcut written once has to be printed twice. `keyName` is what lets a
 * caller name the key rather than the character.
 *
 * `mod` is the platform's own accelerator - Command on a Mac, Control
 * everywhere else - and is the one to reach for. Naming `ctrl` explicitly
 * means Control on both, which on a Mac is a different key from the one every
 * shortcut there uses.
 *
 * The platform is detected from the browser; `platform` overrides it, which is
 * the only reason the prop exists and is why this story can show both at once.
 */
export const Platforms: Story = {
  render: () => (
    <div className="grid grid-cols-[auto_auto_auto] items-center gap-x-4 gap-y-2 text-2xs text-ink-muted">
      <span className="font-medium text-ink">Key</span>
      <span className="font-medium text-ink">macOS</span>
      <span className="font-medium text-ink">Windows and Linux</span>
      {NAMED_KEYS.map((keyName) => (
        <Fragment key={keyName}>
          <span>{keyName}</span>
          <Kbd size="md" keyName={keyName} platform="mac" />
          <Kbd size="md" keyName={keyName} platform="pc" />
        </Fragment>
      ))}
    </div>
  ),
  /**
   * **The two that are the whole reason `keyName` exists.**
   *
   * `mod` resolves to two different keys, and `ctrl` resolves to the same key
   * spelled two ways. A mapping that quietly collapsed either would print a
   * shortcut nobody on that platform can press, and it would look right.
   */
  play: async ({ canvasElement }) => {
    const caps = [...canvasElement.querySelectorAll('kbd')].map((el) => el.textContent)

    await expect(caps).toContain('\u2318')
    await expect(caps).toContain('\u2303')
    await expect(caps).toContain('Ctrl')
    await expect(caps.filter((text) => text === 'Ctrl')).toHaveLength(2)
  },
}

/** The same chord, printed for each keyboard. */
export const ChordPerPlatform: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-3">
      <KbdGroup>
        <Kbd keyName="mod" platform="mac" />
        <Kbd keyName="shift" platform="mac" />
        <Kbd>K</Kbd>
        <span>on macOS</span>
      </KbdGroup>
      <KbdGroup>
        <Kbd keyName="mod" platform="pc" />
        <Kbd keyName="shift" platform="pc" />
        <Kbd>K</Kbd>
        <span>on Windows and Linux</span>
      </KbdGroup>
      <KbdGroup>
        <Kbd keyName="mod" />
        <Kbd keyName="enter" />
        <span>on this browser</span>
      </KbdGroup>
    </div>
  ),
}

/**
 * **An empty cap still holds its minimum width**, so a row of shortcuts whose
 * keys arrive one at a time does not shuffle sideways as they land.
 */
export const Empty: Story = {
  args: { children: '' },
  render: (args) => (
    <KbdGroup>
      <Kbd {...args} />
      <Kbd {...args} size="md" />
    </KbdGroup>
  ),
  play: async ({ canvasElement }) => {
    for (const cap of canvasElement.querySelectorAll('kbd')) {
      await expect(cap.getBoundingClientRect().width).toBeGreaterThan(0)
    }
  },
}

/**
 * A key whose name is longer than a cap expects.
 *
 * The cap grows rather than clipping, because a shortcut printed half is worse
 * than one printed wide.
 */
export const LongKeyName: Story = {
  render: () => (
    <KbdGroup>
      <Kbd keyName="mod" platform="pc" />
      <Kbd>Backspace</Kbd>
    </KbdGroup>
  ),
}
