import type { Meta, StoryObj } from '@storybook/react-vite'
import { SkipForward } from 'lucide-react'
import { useState } from 'react'
import { expect, userEvent, waitFor } from 'storybook/test'

import { Button } from '@/components/ui/button'

import { Transport } from './transport'

/**
 * Play and scrub a value across a range.
 */
const meta = {
  title: 'Blocks/Layout/Transport',
  component: Transport,
  parameters: { layout: 'padded' },
  // The controlled four are stubs: every story holds the value in `Driven`,
  // which is what a real caller does, and passes its own over these.
  args: {
    label: 'Show up to this moment',
    min: 0,
    max: 600,
    value: 0,
    onChange: () => undefined,
    isPlaying: false,
    onPlayingChange: () => undefined,
  },
} satisfies Meta<typeof Transport>

export default meta
type Story = StoryObj<typeof meta>

/** Holds the value, as every real caller does. */
function Driven({
  children,
  ...args
}: Omit<Parameters<typeof Transport>[0], 'value' | 'onChange' | 'isPlaying' | 'onPlayingChange'> & {
  children?: (value: number) => Parameters<typeof Transport>[0]['track']
}) {
  const [value, setValue] = useState(args.min)
  const [playing, setPlaying] = useState(false)
  return (
    <Transport
      {...args}
      value={value}
      onChange={setValue}
      isPlaying={playing}
      onPlayingChange={setPlaying}
      {...(children === undefined ? {} : { track: children(value) })}
    />
  )
}

/**
 * The bare control: a button, a groove and a grip.
 */
export const Default: Story = {
  render: (args) => <Driven {...args} />,
  play: async ({ canvas, step }) => {
    const grip = canvas.getByRole('slider')

    await step('It opens at the bottom of its range', async () => {
      await expect(grip).toHaveValue('0')
      await expect(grip).toHaveAttribute('max', '600')
    })

    await step('And the keyboard moves it without the play button', async () => {
      grip.focus()
      await userEvent.keyboard('{ArrowRight}')
      await expect(Number(grip.getAttribute('value'))).toBeGreaterThan(0)
    })
  },
}

/**
 * Pressing play sweeps the value.
 */
export const Playing: Story = {
  name: 'Playing sweeps the value',
  render: (args) => <Driven {...args} duration={1200} />,
  play: async ({ canvas }) => {
    const grip = canvas.getByRole('slider')
    await expect(grip).toHaveValue('0')
    await userEvent.click(canvas.getByRole('button', { name: /^Play/ }))
    await waitFor(() => {
      void expect(Number(grip.getAttribute('value'))).toBeGreaterThan(0)
    })

    await expect(canvas.getByRole('button', { name: /^Pause/ })).toBeInTheDocument()
  },
}

/**
 * A picture in the groove, and a reading beside the label.
 */
export const Painted: Story = {
  name: 'A shape in the groove',
  render: (args) => (
    <Driven
      {...args}
      output={<span className="font-mono tabular-nums">00:00</span>}
      end={
        <Button variant="ghost" size="icon" aria-label="Jump to the end">
          <SkipForward aria-hidden />
        </Button>
      }
    >
      {(value) => (
        <span aria-hidden className="absolute inset-x-0 bottom-0 flex h-full items-end gap-px">
          {Array.from({ length: 60 }, (_, at) => (
            <span
              key={at}
              className={
                at * 10 <= value ? 'min-w-px flex-1 bg-primary/70' : 'min-w-px flex-1 bg-ink-muted/35'
              }
              style={{ height: `${String(20 + ((at * 37) % 80))}%` }}
            />
          ))}
        </span>
      )}
    </Driven>
  ),
  play: async ({ canvas, canvasElement, step }) => {
    const lit = () =>
      [...canvasElement.querySelectorAll('[class*="bg-primary/70"]')].length

    await step('At the bottom of the range nothing is behind the grip', async () => {
      await expect(canvas.getByRole('slider')).toHaveValue('0')
      await expect(lit()).toBeLessThanOrEqual(1)
    })

    await step('And moving the grip lights the bars it passes', async () => {
      const grip = canvas.getByRole('slider')
      grip.focus()
      await userEvent.keyboard('{End}')
      await waitFor(() => {
        void expect(lit()).toBeGreaterThan(30)
      })
    })

    await step('The reading and the end control are both drawn', async () => {
      await expect(canvas.getByText('00:00')).toBeInTheDocument()
      await expect(canvas.getByRole('button', { name: 'Jump to the end' })).toBeInTheDocument()
    })
  },
}
