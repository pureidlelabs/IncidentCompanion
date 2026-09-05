import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { draw, SCALE, transition } from '@/lib/motion'

import { Button, type ButtonProps } from './button'

/**
 * The two glyphs, as inline geometry rather than `lucide-react` components.
 */
const CLIPBOARD = ['M9 3h6v4H9z', 'M8 5H6v16h12V5h-2']
const CHECK = 'M20 6 9 17l-5-5'

/** Both glyphs sit on top of each other, so the button never reflows mid-swap. */
const GLYPH = 'absolute inset-0 size-full'

const svg = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

/**
 * The swap itself: out of focus on the way in and on the way out.
 */
const blurSwap = {
  initial: { opacity: 0, scale: SCALE.glyph, filter: 'blur(4px)' },
  animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
  exit: { opacity: 0, scale: SCALE.glyph, filter: 'blur(4px)' },
}

export interface CopyButtonProps extends Omit<ButtonProps, 'children' | 'onPress'> {
  /** The text put on the clipboard. */
  value: string
  /** A label beside the icon. Icon-only without one. */
  children?: ReactNode
  /** How long the copied state is held, in milliseconds. Default 1600. */
  resetAfter?: number
  /** Called with what was copied, once the clipboard has taken it. */
  onCopy?: (value: string) => void
}

/**
 * A button that puts `value` on the clipboard and says so by becoming a tick.
 *
 * Takes every `Button` prop but `children` and `onPress`. Icon-only by default,
 * with `aria-label="Copy"` unless the caller sets one.
 * -> https://motion.dev/examples/react-copy-button
 */
export function CopyButton({
  value,
  children,
  resetAfter = 1600,
  onCopy,
  variant = 'ghost',
  size,
  ...props
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = useCallback(() => {
    void (async () => {
      // Read off `navigator` rather than called straight: the types declare
      // `clipboard` as always present, and it is absent in a non-secure
      // context and under jsdom.
      const clipboard = navigator.clipboard as Clipboard | undefined
      if (clipboard === undefined) return
      try {
        await clipboard.writeText(value)
      } catch {
        // A refused clipboard is not a copy. Leave the button as it was.
        return
      }
      setCopied(true)
      onCopy?.(value)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), resetAfter)
    })()
  }, [value, resetAfter, onCopy])

  return (
    <Button
      // Spread rather than passed: `exactOptionalPropertyTypes` refuses an
      // explicit `undefined`, and a caller's own label must still win.
      data-slot="copy-button"
      {...(children === undefined ? { 'aria-label': 'Copy' } : {})}
      {...props}
      variant={variant}
      size={size ?? (children === undefined ? 'icon-sm' : 'sm')}
      onPress={copy}
    >
      <span aria-hidden className="relative inline-block size-4 shrink-0">
        <AnimatePresence initial={false}>
          {copied ? (
            <motion.svg key="copied" {...svg} {...blurSwap} transition={transition.fast} className={GLYPH}>
              <motion.path d={CHECK} variants={draw} initial="hidden" animate="shown" />
            </motion.svg>
          ) : (
            <motion.svg key="idle" {...svg} {...blurSwap} transition={transition.fast} className={GLYPH}>
              {CLIPBOARD.map((d) => (
                <path key={d} d={d} />
              ))}
            </motion.svg>
          )}
        </AnimatePresence>
      </span>
      {children}
      {/* The tick is the sighted answer; this is the same answer for a reader
          who cannot see it. Outside the `aria-hidden` glyph on purpose. */}
      <span className="sr-only" aria-live="polite">
        {copied ? 'Copied' : ''}
      </span>
    </Button>
  )
}
