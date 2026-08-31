import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import {
  CheckboxButton,
  CheckboxField,
  CheckboxGroup as AriaCheckboxGroup,
  FieldError,
  Label,
  Text,
  composeRenderProps,
  type CheckboxFieldProps,
  type CheckboxGroupProps as AriaCheckboxGroupProps,
  type ValidationResult,
} from 'react-aria-components'
import { tv } from 'tailwind-variants'

import { draw, SCALE, transition } from '@/lib/motion'

import { composeClassName } from './rac'

/** The pressable row: the box, then the label. `CheckboxButton` renders a `<label>`. */
const row = tv({
  base: 'group flex items-center gap-2 text-sm transition-colors select-none',
  variants: {
    isDisabled: { true: 'opacity-50' },
  },
})

/**
 * The box. Indeterminate is drawn as selected, with a dash instead of a tick.
 *
 * The unchecked edge is `--ink-muted` at 70%, not `--input`: `--input`
 * over `--background` is 1.70:1 on the dark ground and 1.44:1 on the light one,
 * under the 3:1 a control boundary owes.
 */
const box = tv({
  base: [
    'flex size-4 shrink-0 items-center justify-center',
    'rounded-sm border outline-none transition-colors',
  ],
  variants: {
    isSelected: {
      false: [
        'border-ink-muted/70',
        'group-hover:border-ink-muted group-pressed:border-ring',
      ],
      true: 'border-primary bg-primary text-on-primary dark:bg-primary forced-colors:bg-[Highlight]',
    },
    isFocusVisible: { true: 'border-ring ring-3 ring-ring/50' },
    isInvalid: {
      true: 'border-destructive ring-3 ring-destructive/20 dark:border-destructive/50 dark:ring-destructive/40',
    },
    isDisabled: { true: 'border-border forced-colors:border-[GrayText]' },
  },
  compoundVariants: [
    // A ticked box that is refused keeps the filled ground: the ring says the
    // set is wrong, and repainting the tick says this box is.
    { isSelected: true, isInvalid: true, class: 'border-primary' },
  ],
})

const mark = 'pointer-events-none size-3.5 forced-colors:text-[HighlightText]'

/**
 * The tick, drawn on rather than faded in.
 *
 * **Why the icons are inline rather than `lucide-react`'s.** A `pathLength`
 * animation needs the `path` element itself to be a `motion` element, and an
 * icon component renders its own. The two shapes are lucide's own geometry, so
 * the box looks the same as it did.
 * -> https://motion.dev/examples/react-base-checkbox
 */
const SHAPE = {
  tick: 'M20 6 9 17l-5-5',
  dash: 'M6 12h12',
} as const

function Mark({ shape }: { shape: keyof typeof SHAPE }) {
  return (
    <motion.svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      data-slot="checkbox-mark"
      className={mark}
      initial={{ scale: SCALE.glyph }}
      animate={{ scale: 1 }}
      exit={{ scale: SCALE.glyph, opacity: 0 }}
      transition={transition.fast}
    >
      <motion.path
        d={SHAPE[shape]}
        variants={draw}
        initial="hidden"
        animate="shown"
        exit="gone"
      />
    </motion.svg>
  )
}

export interface CheckboxProps extends CheckboxFieldProps {
  /** The label, beside the box. */
  children?: ReactNode
  /** One line under the box. */
  description?: string | undefined
  /** Shown when validation refuses the value. */
  errorMessage?: string | ((validation: ValidationResult) => string) | undefined
}

/**
 * A checkbox.
 *
 * Takes `isSelected`/`onChange`, not `checked`. A mixed box is
 * `isIndeterminate`, which is a separate prop from the value. Disable with
 * `isDisabled`. Inside a `CheckboxGroup`, give it a `value` instead.
 */
export function Checkbox({ children, description, errorMessage, ...props }: CheckboxProps) {
  return (
    <CheckboxField data-slot="checkbox" {...props} className="group flex flex-col gap-1">
      <CheckboxButton
        className={composeRenderProps(props.className, (className, renderProps) =>
          row({ ...renderProps, className }),
        )}
      >
        {composeRenderProps(children, (resolved, { isSelected, isIndeterminate, ...renderProps }) => (
          <>
            <span
              data-slot="checkbox-box"
              className={box({ ...renderProps, isSelected: isSelected || isIndeterminate })}
            >
              <AnimatePresence initial={false} mode="wait">
                {isIndeterminate ? (
                  <Mark key="dash" shape="dash" />
                ) : isSelected ? (
                  <Mark key="tick" shape="tick" />
                ) : null}
              </AnimatePresence>
            </span>
            {resolved}
          </>
        ))}
      </CheckboxButton>
      {description === undefined ? null : (
        <Text slot="description" className="ms-6 text-sm text-ink-muted">
          {description}
        </Text>
      )}
      <FieldError className="ms-6 text-sm text-destructive">{errorMessage}</FieldError>
    </CheckboxField>
  )
}

export interface CheckboxGroupProps extends Omit<AriaCheckboxGroupProps, 'children'> {
  /** The name of the set, above the boxes. */
  label?: string | undefined
  /** The boxes, each with a `value`. */
  children?: ReactNode
  /** One line under the set. */
  description?: string | undefined
  /** Shown when validation refuses the set. */
  errorMessage?: string | ((validation: ValidationResult) => string) | undefined
}

/**
 * A set of checkboxes under one label.
 *
 * The group holds `value`/`onChange` as an array of the selected `value`
 * strings; each `Checkbox` inside carries only its own `value`.
 */
export function CheckboxGroup({
  label,
  description,
  errorMessage,
  children,
  ...props
}: CheckboxGroupProps) {
  return (
    <AriaCheckboxGroup
      data-slot="checkbox-group"
      {...props}
      className={composeClassName(props.className, 'flex flex-col gap-2')}
    >
      {label === undefined ? null : (
        <Label className="text-sm font-medium text-ink">{label}</Label>
      )}
      <div className="flex flex-col gap-2">{children}</div>
      {description === undefined ? null : (
        <Text slot="description" className="text-sm text-ink-muted">
          {description}
        </Text>
      )}
      <FieldError className="text-sm text-destructive">{errorMessage}</FieldError>
    </AriaCheckboxGroup>
  )
}
