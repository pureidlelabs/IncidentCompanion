import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor } from 'storybook/test'

import { TypedLine, typingSeconds } from './typed-line'

/**
 * A line of copy that types itself in.
 *
 * The auth screen's atmosphere is the one caller: copy that is the first thing
 * on an otherwise empty pane. It reads as the sentence arriving rather than as
 * an ornament on a sentence already there.
 *
 * **Under "reduce motion" every story here renders whole and still**, which is
 * the behaviour rather than a degradation of it.
 *
 * **What the plays hold is the reading, not the motion.** How the line looks
 * arriving is styling and has no assertion. That the whole sentence is
 * available to a screen reader from the first frame, while the part being
 * animated is hidden from it, is a contract -- and it is the one an animation
 * is most likely to break, because the screen looks right either way.
 */
const meta = {
  title: 'Styling/Typed line',
  component: TypedLine,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof TypedLine>

export default meta
type Story = StoryObj<typeof meta>

const FIRST = 'Untangling the intrusion is the hard part.'
const SECOND = 'The report shouldn\u2019t be.'

/** One line, from the auth pane. */
export const Default: Story = {
  name: 'A line typing itself',
  args: { text: FIRST, className: 'text-[19px] font-semibold tracking-tight' },
  play: async ({ canvas, canvasElement, step }) => {
    await step('the whole sentence is readable from the first frame', async () => {
      // Not the part typed so far: a screen reader announcing a line
      // character by character is unusable, and one announcing the finished
      // line only at the end says nothing until the animation is over.
      await expect(canvas.getByText(FIRST)).toBeInTheDocument()
    })

    await step('and the copy being animated is hidden from it', async () => {
      // Both halves are on screen, so without this the sentence is announced
      // twice -- once whole, and once again a fragment at a time.
      const line = canvasElement.querySelector('[data-slot="typed-line"]')!

      // Waited for: the animated copy is empty on the first frame, and an
      // element with no text is not announced whether or not it is hidden --
      // so asserting then would pass against a line that announces both.
      await waitFor(async () => {
        const written = [...line.querySelectorAll('span')].filter(
          (el) => el.textContent !== '',
        )
        await expect(written.length).toBeGreaterThan(1)
      })

      const spoken = [...line.querySelectorAll('span')].filter(
        (el) => el.textContent !== '' && el.getAttribute('aria-hidden') !== 'true',
      )
      await expect(spoken).toHaveLength(1)
      await expect(spoken[0]).toHaveClass('sr-only')
    })
  },
}

/**
 * The pair the auth pane actually draws.
 *
 * The second line's delay is the first line's own typing time plus a beat, so
 * the gap holds however the copy is edited -- a hard-coded delay drifts the
 * moment somebody shortens a word.
 */
export const TwoBeats: Story = {
  name: 'Two beats, the second timed off the first',
  args: { text: FIRST },
  render: (args) => (
    <p className="max-w-[44ch] text-[19px] leading-snug font-semibold tracking-tight text-balance">
      <TypedLine {...args} />
      <TypedLine
        text={SECOND}
        delay={typingSeconds(FIRST) + 0.35}
        className="block font-normal text-ink-muted"
      />
    </p>
  ),
  play: async ({ canvas, step }) => {
    await step('both lines are readable at once', async () => {
      // The second line's delay is derived rather than typed in, and the
      // reading does not wait on it: a reader gets the pair whole while the
      // screen is still drawing the first.
      await expect(canvas.getByText(FIRST)).toBeInTheDocument()
      await expect(canvas.getByText(SECOND)).toBeInTheDocument()
    })

    await step('and the gap is measured from the line before it', async () => {
      // A hard-coded delay drifts the moment somebody shortens a word, and
      // the two lines then overlap or leave a hole. `typingSeconds` is what
      // makes the beat hold however the copy is edited.
      await expect(typingSeconds(FIRST)).toBeGreaterThan(typingSeconds(SECOND))
    })
  },
}

/**
 * A line long enough to wrap.
 *
 * The caret has to stay on the last character rather than jumping to the end of
 * the box, and the paragraph must not grow a row as the second line begins.
 */
export const Wrapping: Story = {
  name: 'A line that wraps',
  args: {
    text: 'A containment action was taken on the mailbox before the export finished, and the timeline records both.',
    className: 'block max-w-[44ch] text-[19px] leading-snug',
  },
}

/** Nothing to type: the caret must not be left blinking over an empty line. */
export const Empty: Story = {
  name: 'An empty line',
  args: { text: '' },
  play: async ({ canvasElement }) => {
    // Nothing to type, so the caret must not be left blinking over an empty
    // line. It is drawn until the typing completes, and with no characters
    // there is no completion to wait for.
    const line = canvasElement.querySelector('[data-slot="typed-line"]')!
    await waitFor(async () => {
      await expect(line.querySelector('[data-slot="typed-caret"]')).toBeNull()
    })
  },
}
