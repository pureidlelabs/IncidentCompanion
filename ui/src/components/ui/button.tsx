import {
  Button as AriaButton,
  Link as AriaLink,
  composeRenderProps,
  type ButtonProps as AriaButtonProps,
  type LinkProps as AriaLinkProps,
} from 'react-aria-components'
import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { tv } from 'tailwind-variants'

import { cn } from '@/lib/cn'
import { swap } from '@/lib/motion'

import { DrawnCheck } from './drawn-check'
import { Spinner } from './spinner'

/**
 * A button.
 *
 * Takes `onPress`, not `onClick`. Disable with `isDisabled`, not `disabled`;
 * use `isRefused` where the analyst is meant to find out why. For an `href`,
 * use `ButtonLink`.
 */
const button = tv({
  base: [
    // `relative` positions the pending spinner over the label.
    'relative inline-flex shrink-0 items-center justify-center whitespace-nowrap',
    // `border-transparent` plus `bg-clip-padding`: every variant is the same
    // box, so an outline and a filled button are the same size on the row.
    'rounded-lg border border-transparent bg-clip-padding',
    'text-sm font-medium outline-none transition-[color,background-color,border-color,box-shadow] select-none',
    // A popup trigger stays put: the menu is anchored to it and would shift.
    // `data-pressed`, not `active:`. React Aria calls `preventDefault` on
    // pointerdown to run its own press handling, which suppresses the
    // browser's `:active` state -- so an `active:` utility here never fires.
    // The `haspopup` exclusion stays: a menu trigger holds its press while
    // the menu is open, and a button stuck 1px down reads as broken.
    'data-pressed:not-aria-[haspopup]:translate-y-px',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
    '[&_svg:not([class*=size-])]:size-4',
  ],
  variants: {
    variant: {
      default: 'bg-primary text-on-primary hover:bg-primary/80',
      outline: [
        'border-border bg-background hover:bg-muted hover:text-ink',
        'dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
        'aria-expanded:bg-muted aria-expanded:text-ink',
      ],
      secondary: [
        'bg-secondary text-on-secondary',
        'hover:bg-[color-mix(in_oklch,var(--secondary),var(--ink)_5%)]',
        'aria-expanded:bg-secondary aria-expanded:text-on-secondary',
      ],
      ghost: [
        'hover:bg-muted hover:text-ink dark:hover:bg-muted/50',
        'aria-expanded:bg-muted aria-expanded:text-ink',
      ],
      destructive: [
        'bg-destructive/10 text-destructive hover:bg-destructive/20',
        'dark:bg-destructive/20 dark:hover:bg-destructive/30',
      ],
      link: 'text-primary underline-offset-4 hover:underline',
    },
    size: {
      xs: 'h-6 gap-1 rounded-md px-2 text-xs [&_svg:not([class*=size-])]:size-3',
      sm: 'h-control-sm gap-1 rounded-md px-2.5 text-sm [&_svg:not([class*=size-])]:size-3.5',
      default: 'h-control-md gap-1.5 px-2.5',
      lg: 'h-control-lg gap-1.5 px-2.5',
      icon: 'size-control-md',
      'icon-xs': 'size-6 rounded-md [&_svg:not([class*=size-])]:size-3',
      'icon-sm': 'size-control-sm rounded-md [&_svg:not([class*=size-])]:size-3.5',
      'icon-lg': 'size-control-lg',
    },
    // The ring is 3px and sits on the border, matching every other control.
    isFocusVisible: { true: 'border-ring ring-3 ring-ring/50' },
    // `isDisabled` is React Aria's render prop, and for a `button` element it
    // does render the native attribute - so this reads dimmed and is also
    // unreachable.
    isDisabled: { true: 'pointer-events-none opacity-50' },
    // Refused: dimmed the same, but the pointer events stay so the tooltip
    // explaining the refusal can fire.
    isRefused: { true: 'cursor-not-allowed opacity-50' },
    isPending: { true: 'cursor-progress' },
  },
  compoundVariants: [
    {
      variant: 'destructive',
      isFocusVisible: true,
      class: 'border-destructive/40 ring-destructive/20 dark:ring-destructive/40',
    },
  ],
  defaultVariants: { variant: 'default', size: 'default' },
})

// Spelled out, not derived from `VariantProps`: react-docgen-typescript
// cannot follow a generated type, and the docs page loses both props.
export interface ButtonLook {
  /** Visual role. At most one `default` per view. */
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link'
  /** Height, from the `--spacing-control-*` scale. `icon-*` are square and need an `aria-label`. */
  size?: 'xs' | 'sm' | 'default' | 'lg' | 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg'
}

/**
 * `onClick` is React Aria's own alias for `onPress` and is refused here.
 *
 * It hands the handler a `MouseEvent` rather than a `PressEvent`, and it rides
 * in on the prop spread rather than through `onPress`, so `isRefused` does not
 * withhold it. -> `button.refused.test.tsx`
 */
export interface ButtonProps extends Omit<AriaButtonProps, 'onClick'>, ButtonLook {
  /**
   * Names the state the label is in, for a button whose label changes.
   *
   * Set it and the label is swapped rather than replaced: the button's width
   * springs to the new content while the old label leaves and the new one
   * arrives over a box that is already the right size. `Delete` becoming
   * `Deleting...` becoming gone reads as one control working, rather than the
   * button jumping width mid-action.
   *
   * Leave it unset and nothing animates.
   * -> https://motion.dev/examples/react-multi-state-badge
   */
  stateKey?: string | number
  /**
   * Refused rather than disabled: the control keeps its tab stop and its
   * pointer events, and announces itself as disabled.
   *
   * **`isDisabled` renders a natively disabled `<button>`**, which no keyboard
   * reaches, no pointer hovers and no tooltip fires on - so a control that
   * refuses for a reason the analyst is meant to discover cannot use it. Use
   * this where the refusal has an explanation attached: another analyst holds
   * the row, the server has not acknowledged it yet.
   *
   * `onPress` is swallowed while set, so a caller cannot forget the guard.
   */
  isRefused?: boolean
  /**
   * The words while a press is in flight, beside the indicator.
   *
   * **Given rather than swapped in, so the button can hold its width.** A
   * caller that changes the child on `isPending` leaves the button knowing one
   * state at a time, and it grows by the difference the moment it is pressed --
   * which in a right-aligned footer shoves everything beside it sideways
   * mid-act. Knowing both, it reserves the wider and swaps in place.
   */
  pendingLabel?: ReactNode
  /**
   * The words once the act has landed, beside a tick that draws itself on.
   *
   * **A moment of it, and only where nothing else reports the result.** A row
   * that vanishes, a toast, a refusal card -- each of those already says what
   * happened, and a third answer on the button says it twice. What this is for
   * is the control whose effect is not visible from where it sits: an export,
   * a copy, a reconnect.
   *
   * Absent by default, so a button that says nothing after the fact goes
   * straight back to rest. Requires `pendingLabel`.
   */
  settledLabel?: ReactNode
  /** How long the settled words are held, in milliseconds. Default 1200. */
  settledFor?: number
}

/**
 * Whether the button is showing the words that follow the act.
 *
 * **Watched rather than passed.** A caller already says when the act ends by
 * dropping `isPending`; asking them to raise a second flag and lower it again
 * is asking them to keep a timer the button can keep itself.
 */
function useSettled(isPending: boolean, enabled: boolean, holdFor: number): boolean {
  const [settled, setSettled] = useState(false)
  const was = useRef(isPending)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (enabled && was.current && !isPending) {
      setSettled(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        setSettled(false)
      }, holdFor)
    }
    was.current = isPending
  }, [isPending, enabled, holdFor])

  useEffect(() => () => clearTimeout(timer.current), [])

  return settled
}

export function Button({
  variant,
  size,
  isRefused,
  pendingLabel,
  settledLabel,
  settledFor = 1200,
  onPress,
  stateKey,
  ...props
}: ButtonProps) {
  const refused = isRefused === true
  const settled = useSettled(
    props.isPending === true,
    pendingLabel !== undefined && settledLabel !== undefined,
    settledFor,
  )
  return (
    <AriaButton
      data-slot="button"
      {...props}
      // `onPress` is withheld rather than overridden: `exactOptionalPropertyTypes`
      // refuses an explicit `undefined`, and a handler that is absent cannot be
      // reached by a keyboard either, which passing a no-op would not guarantee.
      {...(refused ? { 'aria-disabled': true } : onPress ? { onPress } : {})}
      className={composeRenderProps(props.className, (className, renderProps) =>
        button({ ...renderProps, variant, size, isRefused: refused, className }),
      )}
    >
      {composeRenderProps(props.children, (children, { isPending }) => (
        <>
          {/* **The indicator sits beside the words rather than over them.** A
              spinner alone says something is happening and not what; the words
              say both, and go on saying it when the spinning stops for an
              analyst who asked for less motion. That is what lets the motion be
              guarded without the busy state losing its meaning.

              Named, and in the accessibility tree: React Aria announces the
              pending *state* on the button, and the name is this element's
              business.
              -> https://react-aria.adobe.com/Button.html#pending */}
          {pendingLabel === undefined ? (
            <>
              {isPending && (
                <Spinner data-slot="button-pending" size="sm" aria-label="pending" />
              )}
              <span className="contents">
            {stateKey === undefined ? (
              children
            ) : (
              // `popLayout` keeps the two labels on top of one another rather
              // than side by side for a frame, so the width springs once.
              <AnimatePresence initial={false} mode="popLayout">
                <motion.span
                  key={stateKey}
                  layout="position"
                  variants={swap}
                  initial="hidden"
                  animate="shown"
                  exit="gone"
                  className="inline-flex items-center gap-1.5"
                >
                  {children}
                </motion.span>
              </AnimatePresence>
            )}
              </span>
            </>
          ) : (
            /* **Every state stacked in one grid cell, one of them showing.**
               The cell takes the widest, so the box is the same in all of them
               and nothing beside it moves. The ones not showing are `invisible`
               and `aria-hidden`: they are layout and must never be read, which
               is the one case where taking an element out of the accessibility
               tree is the point rather than the bug -- a name computed from
               them would say every state at once. */
            <span className="grid place-items-center">
              {(['rest', 'pending', 'settled'] as const)
                .filter((phase) => phase !== 'settled' || settledLabel !== undefined)
                .map((phase) => {
                  const live =
                    phase === (isPending ? 'pending' : settled ? 'settled' : 'rest')
                  const body =
                    phase === 'pending' ? (
                      <>
                        <Spinner
                          data-slot="button-pending"
                          size="sm"
                          {...(live ? { 'aria-label': 'pending' } : {})}
                        />
                        {pendingLabel}
                      </>
                    ) : phase === 'settled' ? (
                      <>
                        {/* Drawn on rather than appearing whole: the stroke
                            arriving is what says the act just landed. */}
                        <DrawnCheck data-slot="button-settled" />
                        {settledLabel}
                      </>
                    ) : (
                      children
                    )
                  return (
                    <span
                      key={phase}
                      {...(live ? {} : { 'aria-hidden': true, 'data-slot': 'button-sizer' })}
                      className={cn(
                        'col-start-1 row-start-1 inline-flex items-center gap-1.5',
                        live ? '' : 'invisible',
                      )}
                    >
                      {body}
                    </span>
                  )
                })}
            </span>
          )}
        </>
      ))}
    </AriaButton>
  )
}

export interface ButtonLinkProps extends AriaLinkProps, ButtonLook {}

/** A link wearing the button's styles. Navigates, and announces as a link. */
export function ButtonLink({ variant, size, ...props }: ButtonLinkProps) {
  return (
    <AriaLink
      data-slot="button-link"
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        button({ ...renderProps, variant, size, className }),
      )}
    />
  )
}

export { button as buttonVariants }
