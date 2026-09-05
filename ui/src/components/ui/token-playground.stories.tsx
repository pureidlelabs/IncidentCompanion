import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { useRef, useState } from 'react'

import { Badge } from './badge'
import { Button } from './button'
import { Card, CardContent, CardHeader, CardTitle } from './card'
import { Checkbox } from './checkbox'
import { ListBoxItem } from './list-box'
import { Select } from './select'
import { Switch } from './switch'
import { TextField } from './text-field'

/**
 * Drive the token layer by hand and watch the kit follow.
 *
 * **These are the real components.** Nothing below is drawn for the
 * demonstration: the controls write custom properties onto one wrapper, and
 * every `Button`, `Card`, `Switch` and `Select` inside it re-lays itself out
 * because that is where it reads its measures from. Move the spacing base and
 * a dozen paddings move at once; move the control height and only the controls
 * do.
 *
 * **The point is which things move together.** A value that is a token moves
 * the whole kit from one place. A value a component wrote out by hand does not
 * move at all, and this is where that shows: `Button`'s small variant used to
 * carry `text-[0.8rem]`, so its type stayed put while every other tier
 * followed, in plain sight.
 */
const meta = {
  title: 'Styling/Token playground',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/** A token the panel can drive, in the unit the stylesheet declares it in. */
interface Knob {
  token: string
  label: string
  min: number
  max: number
  step: number
  unit: 'rem' | 'px' | 'ms'
  from: number
  note: string
}

const KNOBS: readonly Knob[] = [
  {
    token: '--spacing',
    label: 'Spacing base',
    min: 0.15,
    max: 0.6,
    step: 0.01,
    unit: 'rem',
    from: 0.25,
    note: 'every p-, gap-, m- and size- utility multiplies this',
  },
  {
    token: '--spacing-control-md',
    label: 'Control height',
    min: 1.5,
    max: 4,
    step: 0.0625,
    unit: 'rem',
    from: 2,
    note: 'buttons, inputs and selects together',
  },
  {
    token: '--radius-lg',
    label: 'Corner',
    min: 0,
    max: 28,
    step: 1,
    unit: 'px',
    from: 12,
    note: 'the card, and everything that rounds to its container',
  },
  {
    token: '--text-base',
    label: 'Body size',
    min: 0.7,
    max: 1.6,
    step: 0.0125,
    unit: 'rem',
    from: 0.875,
    note: 'the tier most prose sits on',
  },
  {
    token: '--text-sm',
    label: 'Control size',
    min: 0.65,
    max: 1.4,
    step: 0.0125,
    unit: 'rem',
    from: 0.8125,
    note: 'what a button and a label are set in',
  },
  {
    token: '--duration-base',
    label: 'Motion',
    min: 0,
    max: 1200,
    step: 10,
    unit: 'ms',
    from: 180,
    note: 'press a control after moving this',
  },
]

/** The slice every panel renders, and the only markup in this file. */
function Kit() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button data-testid="md-button">Contain</Button>
        <Button size="sm">Defer now</Button>
        <Badge variant="outlined">unset</Badge>
        <Badge className="bg-severity-critical text-on-severity">critical</Badge>
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
          <Select label="Disposition" defaultSelectedKey="contained">
            <ListBoxItem id="contained">Contained</ListBoxItem>
            <ListBoxItem id="watching">Watching</ListBoxItem>
          </Select>
          <div className="flex items-center gap-3">
            <Switch defaultSelected />
            <span className="text-sm">Keep isolated</span>
            <Checkbox defaultSelected>Notify</Checkbox>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * The playground: a panel of sliders, and the kit standing in what they set.
 *
 * The sliders are plain `<input type="range">` rather than the kit's `Slider`
 * on purpose -- they are instrument chrome, outside the surface under test, and
 * a control that re-styles itself as you drag it is a confusing ruler.
 */
export const Playground: Story = {
  name: 'Drive the tokens',
  render: function Render() {
    const stage = useRef<HTMLDivElement>(null)
    const [values, setValues] = useState<Record<string, number>>(
      Object.fromEntries(KNOBS.map((k) => [k.token, k.from])),
    )

    const set = (knob: Knob, value: number) => {
      setValues((was) => ({ ...was, [knob.token]: value }))
      stage.current?.style.setProperty(knob.token, `${String(value)}${knob.unit}`)
    }

    const reset = () => {
      for (const knob of KNOBS) {
        stage.current?.style.removeProperty(knob.token)
      }
      setValues(Object.fromEntries(KNOBS.map((k) => [k.token, k.from])))
    }

    return (
      <div className="grid grid-cols-1 gap-6 bg-background p-6 text-ink lg:grid-cols-[20rem_1fr]">
        <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-micro tracking-micro uppercase text-ink-muted">
              the token layer
            </span>
            <button
              type="button"
              onClick={reset}
              className="rounded-sm border border-border px-2 py-1 font-mono text-micro uppercase tracking-micro text-ink-muted hover:text-ink"
            >
              reset
            </button>
          </div>

          {KNOBS.map((knob) => (
            <label key={knob.token} className="flex flex-col gap-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-sm">{knob.label}</span>
                <span className="font-mono text-data tabular-nums text-ink-muted">
                  {values[knob.token]}
                  {knob.unit}
                </span>
              </span>
              <input
                type="range"
                min={knob.min}
                max={knob.max}
                step={knob.step}
                value={values[knob.token]}
                aria-label={`${knob.label}, ${knob.token}`}
                onChange={(event) => {
                  set(knob, Number(event.target.value))
                }}
                className="accent-primary"
              />
              <span className="font-mono text-micro text-ink-muted">{knob.token}</span>
              <span className="text-xs text-ink-muted">{knob.note}</span>
            </label>
          ))}
        </div>

        {/* Everything the sliders reach is inside this box, and nothing outside
            it moves -- which is the cascade doing the work rather than a
            re-render. */}
        <div
          ref={stage}
          data-testid="stage"
          className="flex flex-col gap-4 rounded-lg border border-border bg-background p-6"
        >
          <Kit />
        </div>
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    const stage = canvasElement.querySelector<HTMLElement>('[data-testid="stage"]')!
    const button = stage.querySelector<HTMLElement>('[data-testid="md-button"]')!

    const before = getComputedStyle(button).height
    stage.style.setProperty('--spacing-control-md', '3.5rem')
    const after = getComputedStyle(button).height

    // The control reads the token rather than carrying its own height, which is
    // the whole claim the panel is a demonstration of.
    await expect(Number.parseFloat(after)).toBeGreaterThan(Number.parseFloat(before))

    // And the reach is the subtree: a control outside the stage is untouched by
    // the same property, which is what makes two languages on one page possible.
    const outside = canvasElement.querySelector<HTMLElement>('input[type="range"]')!
    await expect(stage.contains(outside)).toBe(false)

    stage.style.removeProperty('--spacing-control-md')
    await expect(getComputedStyle(button).height).toBe(before)
  },
}
