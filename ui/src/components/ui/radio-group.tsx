import { createContext, useContext, type ReactNode } from 'react'
import {
  RadioButton,
  RadioField,
  RadioGroup as AriaRadioGroup,
  FieldError,
  Label,
  Text,
  composeRenderProps,
  type RadioFieldProps,
  type RadioGroupProps as AriaRadioGroupProps,
  type ValidationResult,
} from 'react-aria-components'
import { AnimatePresence, motion } from 'motion/react'
import { tv } from 'tailwind-variants'

import { SCALE, spring } from '@/lib/motion'

import { composeClassName } from './rac'

/**
 * How much chrome an option carries.
 *
 * `plain` is the default and the shape everything already using this component
 * has: a dot and a label, nothing drawn around it. `bordered` puts each option
 * in its own pressable row, which is what a list of two or three settings
 * wants. `card` is the same box laid out as a block, for an option carrying an
 * icon and a line of description.
 */
export type RadioVariant = 'plain' | 'bordered' | 'card'

/**
 * The variant a `RadioGroup` sets for every option under it. An option's own
 * `variant` wins over it.
 */
const RadioVariantContext = createContext<RadioVariant>('plain')

/** The pressable row: the dot, then the label. `RadioButton` renders a `<label>`. */
const row = tv({
  base: 'group flex text-sm transition-colors select-none',
  variants: {
    variant: {
      plain: 'items-center gap-2',
      bordered: 'min-h-control-lg items-center gap-2.5 rounded-lg border border-input bg-background px-3 py-2',
      card: 'items-start gap-2.5 rounded-lg border border-input bg-background p-3',
    },
    isSelected: { true: '', false: '' },
    isFocusVisible: { true: '', false: '' },
    isInvalid: { true: '', false: '' },
    isDisabled: { true: 'opacity-50' },
  },
  compoundVariants: [
    { variant: ['bordered', 'card'], isSelected: false, class: 'hover:bg-accent/40' },
    // The chosen box carries the tone at a wash rather than a fill: a filled
    // option reads as the primary button of the screen it sits on.
    { variant: ['bordered', 'card'], isSelected: true, class: 'border-primary bg-primary/5' },
    { variant: ['bordered', 'card'], isFocusVisible: true, class: 'border-ring ring-3 ring-ring/50' },
    { variant: ['bordered', 'card'], isInvalid: true, class: 'border-destructive' },
    { variant: ['bordered', 'card'], isDisabled: true, class: 'hover:bg-background' },
  ],
  defaultVariants: { variant: 'plain' },
})

/** The dot: a filled circle carrying a small centred pip once chosen. */
const dot = tv({
  base: [
    'flex size-4 shrink-0 items-center justify-center',
    'rounded-full border outline-none transition-colors',
  ],
  variants: {
    isSelected: {
      false: 'border-input dark:bg-input/30 group-pressed:border-ring',
      true: 'border-primary bg-primary text-on-primary dark:bg-primary forced-colors:bg-[Highlight]',
    },
    isFocusVisible: { true: 'border-ring ring-3 ring-ring/50' },
    isInvalid: {
      true: 'border-destructive ring-3 ring-destructive/20 dark:border-destructive/50 dark:ring-destructive/40',
    },
    isDisabled: { true: 'border-border forced-colors:border-[GrayText]' },
  },
  compoundVariants: [
    // Chosen and refused: the ring carries the refusal, the fill stays.
    { isSelected: true, isInvalid: true, class: 'border-primary' },
  ],
})

/** The pip inside a chosen dot. */
const pip = 'size-2 rounded-full bg-on-primary forced-colors:bg-[HighlightText]'

// The box already carries the focus ring in `bordered` and `card`, so the dot
// drops its own rather than drawing a ring inside a ring.
const dotFocus = (variant: RadioVariant, isFocusVisible: boolean) =>
  variant === 'plain' ? isFocusVisible : false

export interface RadioLook {
  /** How much chrome the option carries. Inherited from the group when unset. */
  variant?: RadioVariant
  /** A glyph before the label. Drawn in `bordered` and `card` only. */
  icon?: ReactNode
}

export interface RadioProps extends RadioFieldProps, RadioLook {
  /** The label, beside the dot. */
  children?: ReactNode
  /** One line under the option. */
  description?: string | undefined
}

/**
 * One option in a `RadioGroup`.
 *
 * Takes a `value`; the group holds which one is selected. Disable one option
 * with `isDisabled`.
 *
 * In `bordered` and `card` the whole box is the label, so the description is
 * pressable too; in `plain` it sits under the row as before.
 */
export function Radio({ children, description, variant, icon, ...props }: RadioProps) {
  const inherited = useContext(RadioVariantContext)
  const look = variant ?? inherited
  const boxed = look !== 'plain'
  return (
    <RadioField data-slot="radio" {...props} className="group flex flex-col gap-1">
      <RadioButton
        className={composeRenderProps(props.className, (className, renderProps) =>
          row({ ...renderProps, variant: look, className }),
        )}
      >
        {composeRenderProps(children, (resolved, renderProps) => (
          <>
            <span
              className={dot({
                ...renderProps,
                isFocusVisible: dotFocus(look, renderProps.isFocusVisible),
                ...(look === 'card' ? { className: 'mt-0.5' } : {}),
              })}
            >
              {/* The pip springs in rather than appearing, for the reason the
                  checkbox draws its tick: on a control this small the mark
                  arriving IS the state change, and there is nothing else to
                  read it from. It does not travel between options -- a dot
                  flying down a list of eight says where it went, at the cost of
                  saying it every time somebody picks one. */}
              <AnimatePresence initial={false}>
                {renderProps.isSelected ? (
                  <motion.span
                    key="pip"
                    className={pip}
                    initial={{ scale: SCALE.mark }}
                    animate={{ scale: 1 }}
                    exit={{ scale: SCALE.mark }}
                    transition={spring.control}
                  />
                ) : null}
              </AnimatePresence>
            </span>
            {boxed ? (
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2 [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4">
                  {icon}
                  {resolved}
                </span>
                {description === undefined ? null : (
                  <Text slot="description" className="text-sm text-ink-muted">
                    {description}
                  </Text>
                )}
              </span>
            ) : (
              resolved
            )}
          </>
        ))}
      </RadioButton>
      {boxed || description === undefined ? null : (
        <Text slot="description" className="ms-6 text-sm text-ink-muted">
          {description}
        </Text>
      )}
    </RadioField>
  )
}

export interface RadioGroupProps extends Omit<AriaRadioGroupProps, 'children'>, RadioGroupLook {
  /** The question the options answer. */
  label?: string | undefined
  /** The options, each a `Radio` with a `value`. */
  children?: ReactNode
  /** One line under the options. */
  description?: string | undefined
  /** Shown when validation refuses the choice. */
  errorMessage?: string | ((validation: ValidationResult) => string) | undefined
}

export interface RadioGroupLook {
  /** The chrome every option under this group takes. An option may override it. */
  variant?: RadioVariant
  /**
   * Lay the options in an equal grid this many across.
   *
   * `orientation="horizontal"` sizes each option to its own text, so a card
   * carrying one word and a card carrying a sentence come out different
   * widths. A grid gives them the same column.
   */
  columns?: 2 | 3
}

/**
 * A set of options, one of which is chosen.
 *
 * Holds `value`/`onChange` as the selected option's `value` string. The group
 * is one tab stop and the arrow keys move the selection.
 * `orientation="horizontal"` lays the options in a row.
 *
 * `variant` sets the chrome for every option under it; `plain` is the default
 * and draws nothing around them.
 */
export function RadioGroup({
  label,
  description,
  errorMessage,
  children,
  variant = 'plain',
  columns,
  ...props
}: RadioGroupProps) {
  return (
    <AriaRadioGroup
      data-slot="radio-group"
      {...props}
      className={composeClassName(props.className, 'group flex flex-col gap-2')}
    >
      {label === undefined ? null : (
        <Label className="text-sm font-medium text-ink">{label}</Label>
      )}
      <div
        className={
          columns === undefined
            ? 'flex flex-col gap-2 group-orientation-horizontal:flex-row group-orientation-horizontal:gap-4'
            : `grid gap-3 ${columns === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`
        }
      >
        <RadioVariantContext.Provider value={variant}>{children}</RadioVariantContext.Provider>
      </div>
      {description === undefined ? null : (
        <Text slot="description" className="text-sm text-ink-muted">
          {description}
        </Text>
      )}
      <FieldError className="text-sm text-destructive">{errorMessage}</FieldError>
    </AriaRadioGroup>
  )
}

export { row as radioVariants }
