import { motion } from 'motion/react'
import { createContext, useContext, useId } from 'react'
import {
  ToggleButton as AriaToggleButton,
  ToggleButtonGroup as AriaToggleButtonGroup,
  composeRenderProps,
  type ToggleButtonGroupProps as AriaToggleButtonGroupProps,
  type ToggleButtonProps as AriaToggleButtonProps,
} from 'react-aria-components'
import { tv } from 'tailwind-variants'

import { spring } from '@/lib/motion'

/**
 * The `layoutId` every toggle in one group shares, so the selected ground is
 * one element moving rather than two fading.
 *
 * `null` outside a group: a standalone toggle has nothing to travel between, so
 * it falls back to an id of its own and the ground appears in place.
 */
const GroupIndicator = createContext<string | null>(null)

/** One toggle. `isSelected` is a render prop, so the styles key on it directly. */
const toggleButton = tv({
  base: [
    'relative isolate inline-flex shrink-0 cursor-default items-center justify-center whitespace-nowrap',
    'gap-1 rounded-lg border text-sm font-medium outline-none transition-[color,background-color,border-color,box-shadow] select-none',
    // **`not-selected:`, because a variant beats a plain utility.** A caller
    // that paints its own selected lettering writes `text-background`, which
    // has no variant on it -- so a bare `hover:text-ink` won over it the
    // moment the pointer was on a pressed control, and the label went dark on
    // its own dark ground, at no contrast at all.
    'not-selected:hover:text-ink',
    // The same nudge `Button` takes, so one press reads the same everywhere.
    // `data-pressed`, for the reason `Button` gives: React Aria suppresses
    // the browser's `:active`.
    'data-pressed:translate-y-px',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
    '[&_svg:not([class*=size-])]:size-4',
  ],
  variants: {
    variant: {
      outline: 'border-input bg-transparent text-ink hover:bg-muted',
      ghost: 'border-transparent bg-transparent text-ink hover:bg-muted',
    },
    size: {
      sm: 'h-(--control-h-sm) min-w-7 rounded-md px-2.5 text-[0.8rem] [&_svg:not([class*=size-])]:size-3.5',
      default: 'h-(--control-h-md) min-w-8 px-2.5',
      lg: 'h-(--control-h-lg) min-w-10 px-2.5',
      icon: 'size-(--control-h-md)',
      'icon-sm': 'size-(--control-h-sm) rounded-md [&_svg:not([class*=size-])]:size-3.5',
      'icon-lg': 'size-(--control-h-lg)',
    },
    isFocusVisible: { true: 'border-ring ring-3 ring-ring/50' },
    // Pressed is a ground, not a fill: a row of toggles all wearing `primary`
    // reads as several primaries, and the kit allows one per view.
    //
    // The ground itself is drawn by the `motion` indicator below, not by a
    // `bg-*` here - two grounds would double up while the indicator travels.
    // Forced colours keep theirs on the button: a system palette has no
    // interest in the animation.
    isSelected: {
      true: ['text-ink', 'forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]'],
    },
    // Keyed on the render prop: React Aria leaves a disabled control
    // focusable, so it carries no `disabled` attribute for `disabled:` to hit.
    isDisabled: { true: 'pointer-events-none opacity-50 forced-colors:text-[GrayText]' },
  },
  defaultVariants: { variant: 'outline', size: 'default' },
})

/**
 * The row a group draws.
 *
 * `segmented` joins the buttons into one control by overlapping their borders
 * and squaring every corner but the two ends. The child selector is written
 * against `[data-slot=toggle-button]` rather than `*`, so it outranks the
 * button's own radius instead of tying with it.
 */
const toggleButtonGroup = tv({
  base: 'inline-flex w-fit rounded-lg',
  variants: {
    variant: {
      segmented: '',
      spaced: 'gap-1',
    },
    orientation: {
      horizontal: 'flex-row',
      vertical: 'flex-col',
    },
    isDisabled: { true: 'opacity-50' },
  },
  compoundVariants: [
    {
      variant: 'segmented',
      orientation: 'horizontal',
      class: [
        '-space-x-px',
        '[&_[data-slot=toggle-button]]:rounded-none',
        '[&_[data-slot=toggle-button]:first-child]:rounded-s-lg',
        '[&_[data-slot=toggle-button]:last-child]:rounded-e-lg',
      ],
    },
    {
      variant: 'segmented',
      orientation: 'vertical',
      class: [
        '-space-y-px',
        '[&_[data-slot=toggle-button]]:rounded-none',
        '[&_[data-slot=toggle-button]:first-child]:rounded-t-lg',
        '[&_[data-slot=toggle-button]:last-child]:rounded-b-lg',
      ],
    },
  ],
  defaultVariants: { variant: 'segmented', orientation: 'horizontal' },
})

export interface ToggleButtonLook {
  /** Visual role. `ghost` drops the border, for a dense toolbar. */
  variant?: 'outline' | 'ghost'
  /** Height, from the `--control-h-*` scale. `icon-*` are square and need an `aria-label`. */
  size?: 'sm' | 'default' | 'lg' | 'icon' | 'icon-sm' | 'icon-lg'
  /**
   * Draw the selected ground. `false` where the caller paints its own.
   *
   * The ground is `absolute inset-0 -z-10`, and a negative-z child paints
   * *above its parent's background* and below its content -- so it covers a
   * caller's own selected background rather than sitting behind it. Measured
   * on the filter chip, whose `bg-ink text-background` became
   * `bg-muted` under white lettering: unreadable, and the label the analyst
   * needs most.
   */
  ground?: boolean
}

export interface ToggleButtonProps extends AriaToggleButtonProps, ToggleButtonLook {}

/**
 * A button that stays pressed.
 *
 * Standalone it holds its own state through `isSelected` or `defaultSelected`.
 * Inside a `ToggleButtonGroup` it takes an `id` instead, and the group owns the
 * selection.
 *
 * **The selected ground travels between the buttons of a group**, as one
 * `layoutId` shared through context.
 * -> https://motion.dev/examples/react-base-toggle-group
 *
 * **The press is the same 1px nudge `Button` uses**, in CSS rather than Motion.
 * A control pressed hundreds of times a session wants instant feedback, and one
 * gesture across every pressable thing in the kit -- a scale here and a nudge
 * there is two answers to one question.
 */
export function ToggleButton({ variant, size, ground = true, ...props }: ToggleButtonProps) {
  const shared = useContext(GroupIndicator)
  const own = useId()
  const layoutId = shared ?? own
  return (
    <AriaToggleButton
      data-slot="toggle-button"
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        toggleButton({ ...renderProps, variant, size, className }),
      )}
    >
      {composeRenderProps(props.children, (children, { isSelected }) => (
        <>
          {isSelected && ground && (
            <motion.span
              aria-hidden
              data-slot="toggle-button-indicator"
              layoutId={layoutId}
              transition={spring.indicator}
              // Out of flow, so it contributes nothing to the button's `gap`,
              // and behind the label. `isolate` on the button is what keeps
              // `-z-10` inside this button rather than under the group.
              className="absolute inset-0 -z-10 rounded-[inherit] bg-muted"
            />
          )}
          <span data-slot="toggle-button-content" className="inline-flex items-center gap-1">
            {children}
          </span>
        </>
      ))}
    </AriaToggleButton>
  )
}

export interface ToggleButtonGroupLook {
  /** `segmented` joins the buttons into one control; `spaced` leaves them apart. */
  variant?: 'segmented' | 'spaced'
}

export interface ToggleButtonGroupProps extends AriaToggleButtonGroupProps, ToggleButtonGroupLook {}

/**
 * A set of toggles sharing one selection.
 *
 * `selectionMode` is `single` by default, which is the segmented view switch;
 * pass `multiple` for a toolbar of independent toggles. Each child needs an
 * `id`, and the group needs a `label` through `aria-label` or `aria-labelledby`.
 */
export function ToggleButtonGroup({ variant, ...props }: ToggleButtonGroupProps) {
  // Scoped per group, so two groups on one page do not share an indicator and
  // fly between each other.
  //
  // Withheld under `multiple`: several toggles are selected at once there, and
  // one `layoutId` across all of them is a single element the group would tear
  // between. Each falls back to its own, and the ground appears in place.
  const indicatorId = useId()
  const shared = props.selectionMode === 'multiple' ? null : indicatorId
  return (
    <GroupIndicator.Provider value={shared}>
      <AriaToggleButtonGroup
        data-slot="toggle-button-group"
        {...props}
        className={composeRenderProps(props.className, (className, renderProps) =>
          toggleButtonGroup({ ...renderProps, variant, className }),
        )}
      />
    </GroupIndicator.Provider>
  )
}

export { toggleButton as toggleButtonStyles, toggleButtonGroup as toggleButtonGroupStyles }
