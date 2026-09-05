import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import type { ReactNode } from 'react'

import { Badge } from './badge'
import { Button } from './button'
import { Card, CardContent, CardHeader, CardTitle } from './card'
import { Switch } from './switch'
import { TextField } from './text-field'

/**
 * Two design languages, side by side, from one set of components.
 *
 * **Every panel below renders the same `Slice`.** Nothing in it names a colour,
 * a height, a radius or a duration; it names roles, and the ground it stands on
 * decides what those mean. The panels differ only in the two attributes on
 * their wrapper, which is the whole of what a design language is here.
 *
 * `console` is the language of running an incident: high contrast for scanning,
 * white cards floating on a near-white ground, tight density. `wallboard` is a
 * SOC wall display read at three metres, and it keeps console's hues on purpose
 * -- what separates them is type at roughly 1.6x, a much wider range between
 * ink and ground, borders dark enough to read as rules, no elevation at all
 * because a shadow is a near-field cue, and slower, longer motion because the
 * only movement worth having is a state arriving.
 *
 * **This is a thing the architecture allows rather than a screenshot of two
 * builds.** The languages are attribute selectors over custom properties, so
 * they compose per subtree: both are live in one document, in one React tree,
 * at the same time. Nothing here is possible if a component names a colour.
 */
const meta = {
  title: 'Styling/Design languages',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/** One slice of the kit, written once and rendered under every ground below. */
function Slice() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="default" size="sm">
          Contain
        </Button>
        <Button variant="outline" size="sm">
          Defer
        </Button>
        <Badge variant="outlined">unset</Badge>
        <Badge className="bg-severity-critical text-on-severity">critical</Badge>
        <Badge className="bg-severity-medium text-on-severity">medium</Badge>
      </div>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>WKS-FIN01</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-ink-muted">
            Beacon check-in observed to a known command and control host.
          </p>
          <TextField label="Analyst note" defaultValue="Isolated at 09:12" />
          <div className="flex items-center gap-2">
            <Switch defaultSelected />
            <span className="text-sm">Keep isolated</span>
          </div>
        </CardContent>
      </Card>

      <p className="font-mono text-micro tracking-micro uppercase text-ink-muted">
        last seen 09:14:22
      </p>
    </div>
  )
}

/**
 * One panel: a ground, a language, and the slice standing on it.
 *
 * The attributes are the entire difference between any two panels.
 */
function Panel({
  language,
  theme,
  children,
}: {
  language: string
  theme: 'light' | 'dark'
  children: ReactNode
}) {
  return (
    <div
      data-language={language}
      data-theme={theme}
      data-testid={`${language}-${theme}`}
      className="flex flex-col gap-3 bg-background p-5 text-ink"
    >
      <span className="font-mono text-micro tracking-micro uppercase text-ink-muted">
        {language} &middot; {theme}
      </span>
      {children}
    </div>
  )
}

/**
 * The four combinations at once: two languages, two grounds, one component
 * tree.
 *
 * The `play` is the claim rather than the picture. It reads the same element
 * out of two panels and asserts the language moved what a language owns -- the
 * type scale and the control height -- and not merely the palette. A recolour
 * would pass an equality check on the background and fail every line here.
 */
export const SideBySide: Story = {
  name: 'Two languages at once',
  render: () => (
    <div className="grid grid-cols-1 md:grid-cols-2">
      <Panel language="console" theme="light">
        <Slice />
      </Panel>
      <Panel language="wallboard" theme="light">
        <Slice />
      </Panel>
      <Panel language="console" theme="dark">
        <Slice />
      </Panel>
      <Panel language="wallboard" theme="dark">
        <Slice />
      </Panel>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const button = (panel: string) =>
      canvasElement.querySelector<HTMLElement>(`[data-testid="${panel}"] button`)!

    const console_ = getComputedStyle(button('console-light'))
    const wallboard = getComputedStyle(button('wallboard-light'))

    // Type and density are what a language owns, and a palette swap moves
    // neither. Both panels are in the same document, so this is one render.
    await expect(Number.parseFloat(wallboard.fontSize)).toBeGreaterThan(
      Number.parseFloat(console_.fontSize),
    )
    await expect(Number.parseFloat(wallboard.height)).toBeGreaterThan(
      Number.parseFloat(console_.height),
    )

    // **Every part of a control has to scale together.** The switch's knob is
    // `size-4`, four multiples of `--spacing`, while its track's height was an
    // arbitrary `1.15rem` -- so a language that moved the spacing base grew the
    // knob past the track it sits in, by 0.8px at each edge. Nothing but a
    // second language could show it: under one, the two agreed by coincidence.
    for (const panel of ['console-light', 'wallboard-light']) {
      const host = canvasElement.querySelector<HTMLElement>(`[data-testid="${panel}"]`)!
      const handle = host.querySelector<HTMLElement>('[data-slot="switch-handle"]')!
      const knob = handle.getBoundingClientRect()
      const track = handle.parentElement!.getBoundingClientRect()
      await expect(knob.height, `${panel}: the knob is taller than its track`).toBeLessThanOrEqual(
        track.height,
      )
      await expect(knob.width, `${panel}: the knob is wider than its track`).toBeLessThan(
        track.width,
      )
    }

    // And the two languages really are live at the same time, which is what
    // rules out this being a screenshot of two builds.
    const grounds = ['console-light', 'wallboard-light', 'console-dark', 'wallboard-dark'].map(
      (panel) =>
        getComputedStyle(canvasElement.querySelector<HTMLElement>(`[data-testid="${panel}"]`)!)
          .backgroundColor,
    )
    await expect(new Set(grounds).size).toBe(4)
  },
}
