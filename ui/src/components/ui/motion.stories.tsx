import type { Meta, StoryObj } from '@storybook/react-vite'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { DURATION, anchored, fold, overlay, row, slide, spring, stagger, transition } from '@/lib/motion'

/**
 * Every motion the kit uses, on a button so it can be replayed.
 *
 * The durations and the curve come from the token layer, so what plays here is
 * what plays in a component. Turn on "reduce motion" in the OS and every one of
 * these stops moving without a component checking.
 */
const meta = {
  title: 'Styling/Motion',
  parameters: { layout: 'padded' },
} satisfies Meta<Record<string, never>>

export default meta
type Story = StoryObj<typeof meta>

/** A labelled slab with a replay button and the thing being animated beside it. */
function Bench({
  name,
  note,
  children,
}: {
  name: string
  note: string
  children: (playing: boolean) => React.ReactNode
}) {
  const [playing, setPlaying] = useState(true)
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-ink">{name}</h3>
          <p className="text-xs text-ink-muted">{note}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onPress={() => {
            setPlaying((was) => !was)
          }}
        >
          {playing ? 'Hide' : 'Play'}
        </Button>
      </div>
      <div className="relative flex min-h-24 items-center justify-center rounded-md bg-muted/40 p-4">
        {children(playing)}
      </div>
    </section>
  )
}

const Panel = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-md border border-border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-sm">
    {children}
  </div>
)

/**
 * Every token in the motion scale at once, so one drifting from the rest is
 * visible against its neighbours.
 *
 * A duration or an easing read on its own is a number. Read beside the others it
 * is a rung, and a ladder is the only arrangement in which a wrong rung shows.
 */
export const Everything: Story = {
  name: 'Every motion, replayable',
  render: function Everything() {
    const [slowed, setSlowed] = useState(false)
    return (
      <MotionConfig reducedMotion="user" {...(slowed ? { transition: { duration: 1.2 } } : {})}>
        <div className="mb-4 flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onPress={() => {
              setSlowed((was) => !was)
            }}
          >
            {slowed ? 'Play at real speed' : 'Slow it down'}
          </Button>
          <p className="text-xs text-ink-muted">
            Real speed is 120&ndash;280ms. If nothing moves at all, the OS has
            &ldquo;reduce motion&rdquo; on and the kit is obeying it.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
      <Bench name="overlay" note="A popover, menu or dialog arriving. Fade, a 10px rise, 0.96 scale, 280ms.">
        {(playing) => (
          <AnimatePresence>
            {playing && (
              <motion.div initial="hidden" animate="shown" exit="gone" variants={overlay}>
                <Panel>A surface that just arrived</Panel>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </Bench>

      <Bench name="slide('right')" note="A sheet coming from an edge. 40px of travel, 280ms.">
        {(playing) => (
          <AnimatePresence>
            {playing && (
              <motion.div initial="hidden" animate="shown" exit="gone" variants={slide('right')}>
                <Panel>A panel from the right</Panel>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </Bench>

      <Bench name="row + stagger" note="A list handing its rows in, 50ms apart.">
        {(playing) => (
          <AnimatePresence>
            {playing && (
              <motion.ul
                initial="hidden"
                animate="shown"
                exit="gone"
                variants={stagger}
                className="flex w-full max-w-xs flex-col gap-1"
              >
                {['PC-4417', 'SRV-DC-01', 'FW-EDGE-02', 'PC-2210'].map((host) => (
                  <motion.li
                    key={host}
                    variants={row}
                    className="rounded-md border border-border bg-card px-3 py-1.5 text-sm"
                  >
                    {host}
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        )}
      </Bench>


      <Bench
        name="anchored(placement)"
        note="A popover and a tooltip arriving from the edge they are anchored to. All four sides, so the travel and the transform origin can be checked against each other."
      >
        {(playing) => (
          <div className="grid w-full max-w-md grid-cols-2 gap-3">
            {(['top', 'bottom', 'left', 'right'] as const).map((placement) => {
              const { variants, origin } = anchored(placement)
              return (
                <div key={placement} className="flex items-center justify-center">
                  <AnimatePresence>
                    {playing && (
                      <motion.div
                        initial="hidden"
                        animate="shown"
                        exit="gone"
                        variants={variants}
                        style={{ transformOrigin: origin }}
                      >
                        <Panel>{placement}</Panel>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>
        )}
      </Bench>

      <Bench
        name="spring.fill"
        note="A bar catching up with a value that arrived in one jump. Every press moves it a whole step; the spring is what makes the steps read as one movement."
      >
        {(playing) => (
          <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full origin-left rounded-full bg-primary"
              animate={{ scaleX: playing ? 0.85 : 0.15 }}
              transition={spring.fill}
              style={{ width: '100%' }}
            />
          </div>
        )}
      </Bench>

      <Bench name="fold" note="A section opening on a measured height, so any length folds cleanly.">
        {(playing) => (
          <div className="w-full max-w-xs overflow-hidden">
            <AnimatePresence initial={false}>
              {playing && (
                <motion.div
                  initial="hidden"
                  animate="shown"
                  exit="gone"
                  variants={fold}
                  className="overflow-hidden"
                >
                  <Panel>
                    Three lines of content, so the height being animated is not a number
                    anybody had to guess.
                  </Panel>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </Bench>
        </div>
      </MotionConfig>
    )
  },
}

/** Lane, box and inset in pixels, so the travel below is a plain subtraction. */
const LANE = 320
const BOX = 32
const INSET = 4
const TRAVEL = LANE - BOX - INSET * 2

/**
 * The whole duration scale, restarted together on one clock.
 *
 * **Three lanes, not two.** `fast` against
 * `base` is 120ms against 180ms - a 1.5x ratio and 60ms of daylight, which is
 * below what the eye resolves between two things moving at the same instant. A
 * story showing only those two cannot demonstrate its own claim however it is
 * staged. Adding `slow` puts a 2.3x ratio on screen, and the *ramp* is legible
 * where any single step in it is not: once the eye has `fast` against `slow`,
 * `base` lands where it belongs between them.
 *
 * **One clock, because independent loops drift.** Three `repeat: Infinity`
 * animations at three durations fall out of phase within a few passes, after
 * which the lanes are no longer starting together and the comparison means
 * nothing. A single interval flips one piece of state and all three lanes leave
 * at the same instant, every pass.
 *
 * **`x` and nothing else.** This story previously drove `animate.x` against an
 * inline `style.translateX` of the opposite sign - `x` is Motion's shorthand
 * for `translateX`, so the two cancelled and the box barely moved. One property
 * is declared in one place here.
 *
 * **A transform, and a fixed lane so it can be one.** The travel is a pixel
 * count rather than a percentage because a percentage `x` is a percentage of
 * the *box*, not of the lane - and `left` would animate a layout property, off
 * the compositor, in the one file people copy a motion out of.
 */
export const Durations: Story = {
  name: 'The duration scale',
  render: function Durations() {
    const [at, setAt] = useState(0)

    // The slowest lane plus a beat, so every pass is over before the next
    // starts and the lanes never overlap their own previous run.
    useEffect(() => {
      const clock = setInterval(() => {
        setAt((was) => (was === 0 ? 1 : 0))
      }, DURATION.slow * 1000 + 700)
      return () => {
        clearInterval(clock)
      }
    }, [])

    return (
      <div className="flex flex-col gap-4">
        <p className="text-xs text-ink-muted">
          All three leave together. Watch the gap open between them, not any one lane.
        </p>
        {(['fast', 'base', 'slow'] as const).map((speed) => (
          <div key={speed} className="flex items-center gap-3">
            <span className="w-28 shrink-0 text-xs text-ink-muted">
              {speed} &middot; {DURATION[speed] * 1000}ms
            </span>
            <div
              className="relative h-8 shrink-0 overflow-hidden rounded-md bg-muted/40"
              style={{ width: LANE }}
            >
              <motion.div
                className="absolute inset-y-1 left-1 rounded bg-primary"
                style={{ width: BOX }}
                animate={{ x: at === 0 ? 0 : TRAVEL }}
                transition={transition[speed]}
              />
            </div>
          </div>
        ))}
      </div>
    )
  },
}
