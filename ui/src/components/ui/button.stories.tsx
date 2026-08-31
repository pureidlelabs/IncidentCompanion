import type { Meta, StoryObj } from '@storybook/react-vite'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { expect, fn, screen, userEvent, waitFor } from 'storybook/test'

import { Button, ButtonLink } from './button'
import { Tooltip, TooltipTrigger } from './tooltip'

/**
 * The one control every action in the app is built from.
 *
 * `onPress`, never `onClick`: the alias is refused at the type, since it
 * arrives by prop spread and walks past `isRefused`.
 *
 * Three refusals, differing in reachability. `isDisabled` renders the native
 * attribute, so the control leaves the tab order and no tooltip on it can fire.
 * `isRefused` keeps the tab stop, announces `aria-disabled` and swallows
 * `onPress`, for a refusal with an explanation attached. `isPending` says busy
 * rather than unavailable, and holds the width.
 *
 * An icon-only button needs an `aria-label`. Anything that navigates is
 * `ButtonLink`, whatever it looks like.
 */
const meta = {
  title: 'Components/Button',
  component: Button,
  parameters: { layout: 'centered' },
  args: { children: 'Button', onPress: fn() },
  render: (args) => <Button {...args} />,
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

/** The default: `default` variant at `default` size, and a live press. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Button' }))
    await expect(args.onPress).toHaveBeenCalledTimes(1)
  },
}

/**
 * Every variant, side by side.
 *
 * `default` is the one action a view is asking for and there should be at most
 * one; `destructive` is the one that cannot be undone.
 */
export const Variants: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      <Button {...args} variant="default">
        Default
      </Button>
      <Button {...args} variant="outline">
        Outline
      </Button>
      <Button {...args} variant="secondary">
        Secondary
      </Button>
      <Button {...args} variant="ghost">
        Ghost
      </Button>
      <Button {...args} variant="destructive">
        Destructive
      </Button>
      <Button {...args} variant="link">
        Link
      </Button>
    </div>
  ),
}

/** The size ladder: 24, 28, 32 and 40px. */
export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      <Button {...args} size="xs">
        Extra small
      </Button>
      <Button {...args} size="sm">
        Small
      </Button>
      <Button {...args} size="default">
        Default
      </Button>
      <Button {...args} size="lg">
        Large
      </Button>
    </div>
  ),
}

/**
 * Icon-only, at the four square sizes.
 *
 * **Each needs an `aria-label`.** There is no text to announce, so without one
 * the button is read as "button" and the analyst using a screen reader has four
 * identical ones. The `play` asserts every button on the page is reachable by an
 * accessible name.
 */
export const IconOnly: Story = {
  render: ({ children: _children, ...args }) => (
    <div className="flex items-center gap-3">
      <Button {...args} size="icon-xs" aria-label="Add">
        <Plus />
      </Button>
      <Button {...args} size="icon-sm" aria-label="Add indicator">
        <Plus />
      </Button>
      <Button {...args} size="icon" aria-label="Add entity">
        <Plus />
      </Button>
      <Button {...args} size="icon-lg" variant="destructive" aria-label="Delete">
        <Trash2 />
      </Button>
    </div>
  ),
  play: async ({ canvas }) => {
    for (const name of ['Add', 'Add indicator', 'Add entity', 'Delete']) {
      await expect(canvas.getByRole('button', { name })).toBeInTheDocument()
    }
  },
}

/**
 * **`isDisabled` renders the native `disabled` attribute**, so the control
 * leaves the tab order, fires no pointer events, and nothing overlaid on it -
 * a tooltip carrying a reason - can fire either.
 *
 * Use it where the action is irrelevant until something else changes. Where the
 * analyst is meant to find out *why*, use `isRefused` below.
 */
export const Disabled: Story = {
  args: { isDisabled: true, children: 'Disabled' },
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      <Button {...args} />
      <Button {...args} variant="outline">
        Disabled outline
      </Button>
    </div>
  ),
  play: async ({ args, canvas, step, userEvent }) => {
    const button = canvas.getByRole('button', { name: 'Disabled' })

    await step('The native attribute is what is rendered', async () => {
      await expect(button).toBeDisabled()
      await expect(button).not.toHaveAttribute('aria-disabled')
    })

    await step('It is unreachable from the keyboard', async () => {
      await userEvent.tab()
      await expect(button).not.toHaveFocus()
    })

    // **No click here, and its absence is the evidence.** The variant sets
    // `pointer-events: none`, so `userEvent.click` refuses to synthesise the
    // interaction at all rather than reporting a press that did not happen.
    // Activation is the platform's guarantee once `disabled` is on the element,
    // which is what the assertion above establishes.
    await expect(args.onPress).not.toHaveBeenCalled()
  },
}

/**
 * **`isRefused` is the other half of disabled: reachable and inert.**
 *
 * Both halves matter and they pull against each other - reachable so the
 * analyst can find out why it is refusing, inert so that finding out does not
 * perform the action. It renders `aria-disabled` rather than the native
 * attribute, so the tab stop and the hover survive and the tooltip carrying the
 * reason still fires.
 *
 * `onPress` is withheld rather than overridden, so a caller cannot forget the
 * guard.
 *
 * Use it where the refusal has an explanation: another analyst holds the row,
 * the server has not acknowledged the last write yet.
 */
export const Refused: Story = {
  args: { isRefused: true, children: 'Edit' },
  render: (args) => (
    <TooltipTrigger>
      <Button {...args} />
      <Tooltip>r.okonkwo is editing this</Tooltip>
    </TooltipTrigger>
  ),
  play: async ({ args, canvas, step, userEvent }) => {
    const button = canvas.getByRole('button', { name: 'Edit' })

    await step('Announced as disabled, without the native attribute', async () => {
      await expect(button).toHaveAttribute('aria-disabled', 'true')
      await expect(button).not.toBeDisabled()
    })

    await step('It keeps its tab stop, which is the whole point', async () => {
      await userEvent.tab()
      await expect(button).toHaveFocus()
    })

    // **`screen`, not `canvas`.** A tooltip is portalled to `document.body`, so
    // it is never inside `canvasElement` and every query scoped to the canvas
    // reports it missing. The same holds for every overlay in the kit.
    await step('And the reason is reachable from that focus', async () => {
      await expect(await screen.findByText('r.okonkwo is editing this')).toBeInTheDocument()
      await expect(button).toHaveAttribute('aria-describedby')
    })

    await step('It presses for neither pointer nor keyboard', async () => {
      await userEvent.click(button)
      await userEvent.keyboard('{Enter}')
      await userEvent.keyboard(' ')
      await expect(args.onPress).not.toHaveBeenCalled()
    })
  },
}

/**
 * A press in flight, and the width it does not cost.
 *
 * **The button is told both sets of words and reserves the wider**, so it is the
 * same size before and after and nothing beside it moves. A caller swapping the
 * child instead leaves it knowing one state at a time: a destructive button went
 * 62px to 139px that way, which in a right-aligned footer shoves everything
 * along mid-act.
 *
 * The indicator sits beside the words rather than over them, so the busy state
 * still reads when the spinning stops for an analyst who asked for less motion.
 */
export const Pending: Story = {
  name: 'A press in flight',
  render: () => (
    <div className="flex items-center gap-3">
      <Button variant="destructive" pendingLabel={'Deleting\u2026'} data-testid="rest">
        Delete
      </Button>
      <Button variant="destructive" isPending pendingLabel={'Deleting\u2026'} data-testid="busy">
        Delete
      </Button>
    </div>
  ),
  play: async ({ canvas, step }) => {
    const rest = canvas.getByTestId('rest')
    const busy = canvas.getByTestId('busy')

    await step('The two are the same width', async () => {
      await expect(busy.getBoundingClientRect().width).toBeCloseTo(
        rest.getBoundingClientRect().width,
        0,
      )
    })

    await step('Each is named by the words it is showing', async () => {
      await expect(canvas.getAllByRole('button', { name: 'Delete' })).toHaveLength(1)
      await expect(canvas.getAllByRole('button', { name: /Deleting/ })).toHaveLength(1)
    })

    // The sizer is layout and must never be read: it holds the other state's
    // words, so a button announced from it would say both at once.
    await step('And the sizer holding the width is not read', async () => {
      await expect(busy.querySelector('[data-slot="button-sizer"]')).toHaveAttribute(
        'aria-hidden',
      )
    })

    await step('The one in flight refuses a press', async () => {
      await expect(busy).toHaveAttribute('aria-disabled', 'true')
    })
  },
}

/**
 * **`ButtonLink` navigates, so it announces as a link.**
 *
 * Something that takes the analyst somewhere is a link whatever it looks like -
 * it opens in a new tab on a middle click, it is copied as an address, and a
 * screen reader lists it among the links. A `Button` with an `onPress` that
 * navigates does none of that.
 */
export const AsLink: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <ButtonLink href="#case" variant="outline">
        Open the case
      </ButtonLink>
      <ButtonLink href="#more" variant="link">
        Read more
      </ButtonLink>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Open the case' })).toHaveAttribute(
      'href',
      '#case',
    )
    await expect(canvas.queryByRole('button', { name: 'Open the case' })).not.toBeInTheDocument()
  },
}

/**
 * A label that changes without the button jumping width.
 *
 * `stateKey` names the state; the old label leaves while the new one arrives
 * over a box that has already sprung to the new size. Unset, none of this
 * happens and the button is what it was.
 *
 * **Whether that reads as one control working is the visual tier's question.**
 * What is assertable here is that the label actually changes and the control
 * stays a single button throughout.
 */
export const MultiState: Story = {
  name: 'A label that changes',
  render: function MultiState() {
    const [state, setState] = useState<'idle' | 'working' | 'done'>('idle')
    const label = state === 'idle' ? 'Delete' : state === 'working' ? 'Deleting\u2026' : 'Deleted'
    return (
      <div className="flex items-center gap-4">
        <Button
          variant="destructive"
          stateKey={state}
          isPending={state === 'working'}
          onPress={() => {
            setState('working')
            setTimeout(() => {
              setState('done')
            }, 1200)
            setTimeout(() => {
              setState('idle')
            }, 2600)
          }}
        >
          {label}
        </Button>
        <p className="text-xs text-ink-muted">
          Press it. The width springs to the new label rather than snapping.
        </p>
      </div>
    )
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      void expect(canvas.getByRole('button', { name: /Deleting/ })).toBeInTheDocument()
    })
    await expect(canvas.getAllByRole('button')).toHaveLength(1)
  },
}



/**
 * The moment after the act lands.
 *
 * **A tick drawn on beside the settled words**, held for `settledFor` and then
 * gone. The stroke arriving is what says the thing just happened, rather than a
 * glyph that was always going to be there appearing all at once.
 *
 * `settledLabel` is absent by default, because most acts are already reported
 * by what they changed -- a row that goes, a toast, a refusal card -- and a
 * third answer on the button says it twice. This is for the control whose
 * effect is not visible from where it sits.
 */
export const Settled: Story = {
  name: 'After the act lands',
  render: function Settled() {
    const [busy, setBusy] = useState(false)
    return (
      <Button
        variant="outline"
        isPending={busy}
        pendingLabel={'Exporting\u2026'}
        settledLabel="Exported"
        onPress={() => {
          setBusy(true)
          setTimeout(() => {
            setBusy(false)
          }, 600)
        }}
      >
        Export
      </Button>
    )
  },
  play: async ({ canvas, step }) => {
    const button = canvas.getByRole('button')
    const width = button.getBoundingClientRect().width

    await step('It says what it is doing', async () => {
      await userEvent.click(button)
      await waitFor(() => {
        void expect(canvas.getByRole('button', { name: /Exporting/ })).toBeInTheDocument()
      })
    })

    await step('Then what it did, with a tick', async () => {
      await waitFor(
        () => {
          void expect(canvas.getByRole('button', { name: /Exported/ })).toBeInTheDocument()
        },
        { timeout: 3000 },
      )
      await expect(button.querySelector('[data-slot="button-settled"]')).not.toBeNull()
    })

    await step('And it never changed width doing either', async () => {
      await expect(button.getBoundingClientRect().width).toBeCloseTo(width, 0)
    })
  },
}
