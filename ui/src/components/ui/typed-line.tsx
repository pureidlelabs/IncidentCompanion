import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { useEffect, useState } from 'react'

/**
 * Characters per second. Read once so a pair of lines can time their gap.
 */
export const CHARS_PER_SECOND = 18

/** How long `text` takes to type, for the line that follows it. */
export function typingSeconds(text: string): number {
  return text.length / CHARS_PER_SECOND
}

/**
 * A line of copy that types itself in.
 */
export function TypedLine({
  text,
  delay = 0,
  className,
}: {
  /** The line. Also what a screen reader is given, whole and at once. */
  text: string
  /** Seconds before this line starts. `typingSeconds` sizes the one before it. */
  delay?: number
  className?: string
}) {
  const reduced = useReducedMotion()
  const typed = useMotionValue(0)
  const shown = useTransform(typed, (value) => text.slice(0, Math.round(value)))
  const [done, setDone] = useState(false)

  // A new line resets the caret during the render that brings it, not from an
  // effect. An effect's `setState` runs after React has committed the frame
  // that had the old state in it, so the caret would be missing for that frame
  // and come back on the next - and the same call in an effect body is the
  // cascading render `react-hooks/set-state-in-effect` refuses.
  const [typing, setTyping] = useState(text)
  if (typing !== text) {
    setTyping(text)
    setDone(false)
  }

  useEffect(() => {
    if (reduced) {
      typed.set(text.length)
      return
    }
    typed.set(0)
    const playing = animate(typed, text.length, {
      duration: typingSeconds(text),
      // Linear, and it is the one place in the app that is: a character is a
      // discrete step, and an eased one arrives in a rush and then dawdles.
      ease: 'linear',
      delay,
      onComplete: () => {
        setDone(true)
      },
    })
    return () => {
      playing.stop()
    }
  }, [delay, reduced, text, typed])

  return (
    <span className={className} data-slot="typed-line">
      <span className="sr-only">{text}</span>
      <motion.span aria-hidden>{shown}</motion.span>
      {done || reduced ? null : (
        /* **The caret is a box, not a glyph.** A pipe or a block character is a
           different width in every face and sits off the baseline in most; a
           `w-px h-[1em]` span is the caret at whatever size the type is set at.
           It is also what holds a following line's height open before that line
           starts, so the paragraph does not grow a row mid-animation. */
        <motion.span
          aria-hidden
          data-slot="typed-caret"
          className="ms-0.5 inline-block h-[1em] w-px translate-y-[0.12em] bg-current"
          animate={{ opacity: [1, 1, 0, 0] }}
          transition={{ duration: 1.06, repeat: Infinity, times: [0, 0.49, 0.5, 1] }}
        />
      )}
    </span>
  )
}
