import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor } from 'storybook/test'

import { Avatar } from './avatar'

/**
 * A portrait stand-in, drawn rather than fetched: a story may not reach the
 * network, and a transparent pixel loads successfully and shows nothing.
 *
 * `ground` and `ink` are passed as literals rather than tokens: an `<img>`
 * loads in its own document and inherits none of this page's custom properties.
 */
function portrait(ground: string, ink: string): string {
  const svg = [
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>",
    `<rect width='64' height='64' fill='${ground}'/>`,
    `<circle cx='32' cy='25' r='11' fill='${ink}'/>`,
    `<path d='M8 64c0-13 11-21 24-21s24 8 24 21z' fill='${ink}'/>`,
    '</svg>',
  ].join('')
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const PORTRAITS = [
  portrait('#3f5b8c', '#c7d4ea'),
  portrait('#6b4b7a', '#e3d2ea'),
  portrait('#2f6b5c', '#c9e6dd'),
]

/**
 * An address that cannot resolve to an image, so the browser really fails to
 * load it rather than being told it did.
 */
const UNREACHABLE = 'data:image/png;base64,not-an-image'

/**
 * A person, as a disc: their picture, or their initials on a coloured ground.
 *
 * `name` is the only required prop and supplies the accessible name. The whole
 * disc is one `role="img"` and the initials inside are `aria-hidden`, so a
 * reader hears the name once rather than the name and then two letters.
 *
 * Every path ends in something drawn: no `src`, an empty one, a picture that
 * fails to load, cleared initials, or a name with no letters in it. The disc is
 * often the only thing on screen saying who did something.
 *
 * `tone` comes from whatever tracks presence rather than being chosen per call
 * site. `initialsOf` is exercised as a function in `avatar.test.tsx`.
 */
const meta = {
  title: 'Components/Avatar',
  component: Avatar,
  parameters: { layout: 'centered' },
  args: { name: 'Dana Okoro', size: 'md' },
  render: (args) => <Avatar {...args} />,
} satisfies Meta<typeof Avatar>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The default: initials taken from the name.
 *
 * **The disc is one labelled image, not two letters.** Read out, `DO` beside a
 * label that already said the name is "dee oh" for no reason, so the letters
 * are hidden and the disc carries the accessible name.
 */
export const Default: Story = {
  play: async ({ canvas }) => {
    const disc = canvas.getByRole('img', { name: 'Dana Okoro' })
    await expect(canvas.getByText('DO')).toHaveAttribute('aria-hidden')
    await expect(disc).toContainElement(canvas.getByText('DO'))
  },
}

export const Sizes: Story = {
  render: ({ size: _size, ...args }) => (
    <div className="flex items-center gap-3">
      <Avatar {...args} size="xs" />
      <Avatar {...args} size="sm" />
      <Avatar {...args} size="md" />
      <Avatar {...args} size="lg" />
      <Avatar {...args} size="xl" />
    </div>
  ),
  play: async ({ canvas }) => {
    const widths = canvas
      .getAllByRole('img')
      .map((el) => el.getBoundingClientRect().width)
    await expect(widths).toHaveLength(5)
    for (let index = 1; index < widths.length; index += 1) {
      await expect(widths[index]!).toBeGreaterThan(widths[index - 1]!)
    }
  },
}

/**
 * Every tone. The `presence-*` three are the analyst colours, and are assigned
 * by whatever is tracking who is in the case rather than chosen per call site.
 */
export const Tones: Story = {
  render: ({ name: _name, size: _size, ...args }) => (
    <div className="flex items-center gap-3">
      <Avatar {...args} name="Dana Okoro" tone="muted" size="lg" />
      <Avatar {...args} name="Ravi Menon" tone="accent" size="lg" />
      <Avatar {...args} name="Sam Vale" tone="primary" size="lg" />
      <Avatar {...args} name="Ines Duarte" tone="presence-1" size="lg" />
      <Avatar {...args} name="Karl Brandt" tone="presence-2" size="lg" />
      <Avatar {...args} name="Mei Lin" tone="presence-3" size="lg" />
    </div>
  ),
  play: async ({ canvas }) => {
    // Six tones, six grounds. A tone that stopped resolving would paint the
    // default and the row would still read as deliberate.
    const grounds = canvas
      .getAllByRole('img')
      .map((el) => getComputedStyle(el).backgroundColor)
    await expect(new Set(grounds).size).toBe(6)
  },
}

/** With a picture. The name still supplies the accessible name. */
export const WithImage: Story = {
  render: ({ name: _name, size: _size, ...args }) => (
    <div className="flex items-center gap-3">
      <Avatar {...args} name="Dana Okoro" src={PORTRAITS[0]} size="lg" />
      <Avatar {...args} name="Priya Raman" src={PORTRAITS[1]} size="xl" />
    </div>
  ),
  play: async ({ canvas }) => {
    const disc = canvas.getByRole('img', { name: 'Dana Okoro' })
    await expect(disc.querySelector('img')).not.toBeNull()
    // The picture does not supply the name. A decorative `alt` on the inner
    // image plus a labelled disc is one announcement, not two.
    await expect(canvas.queryByText('DO')).not.toBeInTheDocument()
  },
}

/**
 * **A picture that does not arrive falls back to the initials.**
 *
 * The disc is often the only thing on screen saying who did something, and a
 * served avatar can fail for reasons the screen cannot see - a revoked session,
 * a version bumped by another analyst, a proxy in the way. Without the fallback
 * the row shows an empty circle and the attribution is gone.
 *
 * **This is the tier where that failure is real.** The unit test fires the
 * `error` event by hand because jsdom loads no image at all; here the browser
 * genuinely fails to decode the address and the component's own handler runs.
 */
export const PictureFailsToLoad: Story = {
  args: { name: 'Dana Okoro', src: UNREACHABLE, size: 'lg' },
  play: async ({ canvas }) => {
    await waitFor(() => {
      void expect(canvas.getByText('DO')).toBeInTheDocument()
    })
    await expect(canvas.getByRole('img', { name: 'Dana Okoro' })).toBeInTheDocument()
  },
}

/**
 * The spellings a roster actually carries.
 *
 * A name split on whitespace alone gives one letter for `r.okonkwo` and takes a
 * letter of the *domain* for an address, so the derivation splits on
 * punctuation too. `initialsOf` is tested exhaustively as a function - this
 * story is where the results are looked at.
 */
export const Fallbacks: Story = {
  render: ({ name: _name, size: _size, ...args }) => (
    <div className="flex items-center gap-3">
      <Avatar {...args} name="Root" size="lg" />
      <Avatar {...args} name="r.okonkwo" size="lg" />
      <Avatar {...args} name="p.zero@meridian.example" size="lg" />
      <Avatar {...args} name="   " size="lg" />
      <Avatar {...args} name="Dana Okoro" initials="DO" tone="presence-2" size="lg" />
    </div>
  ),
  play: async ({ canvas }) => {
    // A name with nothing to take a letter from still draws a disc rather than
    // an empty circle, because the disc is what carries attribution.
    await expect(canvas.getByText('?')).toBeInTheDocument()
  },
}

/**
 * The longest name a roster is likely to hold, and one that is a single long
 * token.
 *
 * The disc never grows: it is a fixed size, and the initials are two characters
 * whatever the name is. What this story is for is the row beside it.
 */
export const LongNames: Story = {
  render: ({ name: _name, size: _size, ...args }) => (
    <div className="flex w-72 flex-col gap-3 text-sm">
      {[
        'Maria-Alexandra Fernandes de Oliveira Santos',
        'automation-service-account-prod-eastus2',
      ].map((name) => (
        <div key={name} className="flex items-center gap-2">
          <Avatar {...args} name={name} size="md" />
          <span className="truncate text-ink-muted">{name}</span>
        </div>
      ))}
    </div>
  ),
}
