import type { Meta, StoryObj } from '@storybook/react-vite'

import { expect, userEvent, waitFor, within } from 'storybook/test'

import { Button } from './button'
import { ToastCard, ToastQueue, ToastRegion, type ToastMessage } from './toast'

/**
 * One live region, and the rest drawn.
 *
 * **A `ToastRegion` portals into React Aria's top layer and is an app-level
 * singleton**, so a page can hold exactly one. A docs page renders every story
 * inline, and seven regions fighting over that layer logged 18,388 serialised
 * React fibers in one dev-server session and pinned a core. A bare
 * `AriaToastRegion` probe logged none, and the same stories run one at a time
 * logged none, so the count was the whole of it.
 *
 * The first story mounts the region and is where the motion, the swipe and the
 * stacking are judged. Every story after it draws `ToastCard`, which shares the
 * real one's paint and has no queue behind it.
 */
const queue = new ToastQueue<ToastMessage>({ maxVisibleToasts: 4 })

/**
 * One card in the toast queue, which the analyst can dismiss by dragging it away
 * in the direction it arrived from.
 *
 * **The tone is drawn three times over.** A rail on the leading edge, a tinted
 * chip, and a mark inside that chip -- so the tone survives a reader who cannot
 * separate the colours and a screenshot that has lost them. The title keeps its
 * own ink at every tone, because a coloured heading reads as emphasis rather
 * than as category and a queue of four then shouts in four directions.
 *
 * **The rail is a `::before`.** A border would change the card's own weight on
 * one side, so nothing reads it off the card's `borderColor` -- the demonstrations
 * below pass the pseudo-element to `getComputedStyle`, which is the only place
 * that colour exists.
 */
const meta = {
  title: 'Components/Toast',
  component: ToastRegion,
  parameters: { layout: 'padded' },
  args: { queue },
} satisfies Meta<typeof ToastRegion>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The only story with a region behind it: raise one and it behaves as it does in
 * the app.
 *
 * The region portals into React Aria's top layer, so the cards are outside this
 * story's own canvas. The `play` reaches for the document rather than the
 * canvas, and a renderer that portals nothing sees none of it.
 *
 * **Raising, stacking and closing are the foundation's**, measured -- the close
 * button carries `slot="close"` and React Aria takes it from there, so gutting
 * this component's own `close` leaves the demonstration green. What that `close`
 * serves is the swipe, which is a gesture this harness cannot make. The story is
 * kept because it is the one place the real queue runs at all.
 */
export const Live: Story = {
  name: 'Live \u2014 raise one and dismiss it',
  render: (args) => (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          onPress={() => {
            args.queue.add({ title: 'Timeline entry saved' })
          }}
        >
          Raise one
        </Button>
        <Button
          variant="outline"
          onPress={() => {
            args.queue.add({
              title: 'Save refused',
              description: 'Nadia Okonjo wrote to this entry first.',
              tone: 'destructive',
            })
          }}
        >
          Raise a refusal
        </Button>
        <Button
          variant="outline"
          onPress={() => {
            args.queue.add({ title: 'Timeline entry saved' })
            args.queue.add({ title: 'Systems imported', description: '14 rows added.' })
            args.queue.add({ title: 'Report exported' }, { timeout: 5000 })
          }}
        >
          Raise three
        </Button>
      </div>
      <p className="mt-3 text-xs text-ink-muted">
        Swipe right to dismiss, or press the close button. The survivors move up
        into the gap. The third of the three dismisses itself after five seconds.
      </p>
      <ToastRegion {...args} />
    </>
  ),
  play: async ({ canvas, step }) => {
    const inPage = within(document.body)

    await step('Nothing stands until one is raised', async () => {
      await expect(inPage.queryAllByRole('alertdialog')).toHaveLength(0)
    })

    await step('Raising one puts it in the region', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'Raise one' }))
      await waitFor(() => {
        void expect(inPage.getAllByRole('alertdialog')).toHaveLength(1)
      })
      await expect(inPage.getByText('Timeline entry saved')).toBeInTheDocument()
    })

    await step('And the close button takes it away again', async () => {
      await userEvent.click(
        within(inPage.getAllByRole('alertdialog')[0]!).getByRole('button', { name: 'Dismiss' }),
      )
      await waitFor(() => {
        void expect(inPage.queryAllByRole('alertdialog')).toHaveLength(0)
      })
    })

    await step('Three raised are three stacked', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'Raise three' }))
      await waitFor(() => {
        void expect(inPage.getAllByRole('alertdialog')).toHaveLength(3)
      })
      for (const toast of inPage.getAllByRole('alertdialog')) {
        await userEvent.click(within(toast).getByRole('button', { name: 'Dismiss' }))
      }
      await waitFor(() => {
        void expect(inPage.queryAllByRole('alertdialog')).toHaveLength(0)
      })
    })
  },
}

/** A title alone, which is most of them. */
export const TitleOnly: Story = {
  name: 'A title alone',
  render: () => <ToastCard title="Timeline entry saved" />,
}

/** A consequence the analyst cannot see from the screen. */
export const WithDescription: Story = {
  name: 'With a description',
  render: () => (
    <ToastCard
      title="Systems imported"
      description="14 rows added. Two were skipped as probable duplicates."
    />
  ),
}

/**
 * A failure: the rail and the chip carry the tone, and the title does not change
 * colour.
 */
export const Destructive: Story = {
  name: 'A refused write',
  render: () => (
    <ToastCard
      tone="destructive"
      title="Save refused"
      description="Nadia Okonjo wrote to this entry first. Review the two versions."
    />
  ),
  play: async ({ canvasElement, step }) => {
    const card = canvasElement.querySelector<HTMLElement>('[data-slot="toast-card"]')!
    const title = card.querySelector('p')!

    await step('The rail and the chip take the tone', async () => {
      const rail = getComputedStyle(card, '::before').backgroundColor
      const chip = getComputedStyle(card.querySelector('span')!).color
      await expect(rail).not.toBe('rgba(0, 0, 0, 0)')
      await expect(chip).not.toBe(getComputedStyle(title).color)
    })

    await step('And the title keeps its own ink', async () => {
      await expect(title.className).toContain('text-ink')
    })
  },
}

/**
 * All four together, which is the only way to judge one against the other.
 *
 * **A warning and a failure are different events and are drawn differently.**
 * A conflict is a row somebody else changed and the write can still land; a
 * failure is a write that did not. Collapsed onto one colour, an analyst reads
 * the first as the second and goes looking for damage. The tones are `Alert`'s,
 * so a standing message and a toast about the same thing agree.
 *
 * The `play` measures all three carriers at once -- four rails, four chips, four
 * marks -- and the titles against each other, since one heading taking a tone is
 * how a set of four stops reading as a set.
 */
export const Tones: Story = {
  name: 'All four tones',
  render: () => (
    <div className="flex flex-col gap-2">
      <ToastCard title="Timeline entry saved" description="Visible to everyone on the case." />
      <ToastCard
        tone="success"
        title="Report exported"
        description="full-investigation.docx"
      />
      <ToastCard
        tone="warning"
        title="3 systems were no longer there."
        description="The rest of the selection was removed."
      />
      <ToastCard
        tone="destructive"
        title="Save refused"
        description="Nadia Okonjo wrote to this entry first."
      />
    </div>
  ),
  play: async ({ canvasElement, step }) => {
    const cards = [...canvasElement.querySelectorAll<HTMLElement>('[data-slot="toast-card"]')]

    await step('Four rails, four chips', async () => {
      const rails = cards.map((card) => getComputedStyle(card, '::before').backgroundColor)
      const chips = cards.map((card) => getComputedStyle(card.querySelector('span')!).color)
      await expect(new Set(rails).size).toBe(4)
      await expect(new Set(chips).size).toBe(4)
    })

    await step('And four marks, so the tone survives without the colour', async () => {
      const marks = cards.map((card) => card.querySelector('svg')!.getAttribute('class'))
      await expect(new Set(marks).size).toBe(4)
    })

    await step('One ink across every title', async () => {
      const inks = cards.map((card) => getComputedStyle(card.querySelector('p')!).color)
      await expect(new Set(inks).size).toBe(1)
    })
  },
}

/**
 * Long enough to wrap, so the card's measure and the close button's place are
 * visible.
 *
 * The chip and the close button both hold the top line: the text column takes
 * the slack between them, so a card grows downwards and the dismiss stays where
 * the analyst last saw it however long the message runs.
 */
export const LongText: Story = {
  name: 'Text that wraps',
  render: () => (
    <ToastCard
      title="The case archive could not be written to the export directory"
      description="The path exists and is not writable by this install. Nothing was removed from the case, and the export can be retried once the permission is corrected."
    />
  ),
  play: async ({ canvasElement, step }) => {
    const card = canvasElement.querySelector<HTMLElement>('[data-slot="toast-card"]')!
    const box = card.getBoundingClientRect()

    await step('It grew downwards rather than sideways', async () => {
      const title = card.querySelector('p')!
      const line = Number.parseFloat(getComputedStyle(title).lineHeight)

      // The title alone runs to more than one line, and nothing spills sideways
      // out of the card's own measure.
      await expect(title.getBoundingClientRect().height).toBeGreaterThan(line * 1.5)
      await expect(card.scrollWidth).toBeLessThanOrEqual(Math.ceil(box.width))
    })

    // Against the card's own top, not against the chip: both parts centre
    // together if the row does, so a chip-relative reading passes for a card
    // whose controls have slid to the middle of five lines of text.
    await step('And the dismiss is still on the first line', async () => {
      const dismiss = card.querySelector('button')!.getBoundingClientRect()
      const line = Number.parseFloat(getComputedStyle(card.querySelector('p')!).lineHeight)
      await expect(dismiss.top - box.top).toBeLessThan(line * 2)
    })
  },
}
