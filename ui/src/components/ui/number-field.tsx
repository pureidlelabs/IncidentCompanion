import { ChevronDown, ChevronUp } from 'lucide-react'
import {
  NumberField as AriaNumberField,
  Button,
  composeRenderProps,
  type ButtonProps,
  type NumberFieldProps as AriaNumberFieldProps,
  type ValidationResult,
} from 'react-aria-components'
import { tv } from 'tailwind-variants'

import { composeClassName } from './rac'
import {
  Description,
  FieldError,
  FieldGroup,
  GroupInput,
  Label,
  type FieldLook,
} from './field'

/**
 * One stepper. `border-inherit` rather than a colour of its own, so the divider
 * follows the group's focus and invalid states without repeating them.
 *
 * **Under the 24px target floor, and left there.** Two of these stacked inside
 * a field share its height, so they measure 15px at `md` and 19px at `lg` --
 * and the only ways past that both change the control's vocabulary rather than
 * its hit area: a field 48px tall stops matching `--spacing-control-*` in every form
 * row it sits in, and moving the pair either side of the input redraws the
 * control. Both are the maintainer's call. What holds meanwhile is WCAG 2.5.8's
 * equivalent-control exception: the input beside them takes the same number by
 * typing, at the full height of the field, and the arrow keys step it.
 */
const stepper = tv({
  base: [
    'flex flex-1 items-center justify-center bg-transparent px-1.5',
    'text-ink-muted outline-none transition-colors',
    'hover:bg-muted hover:text-ink pressed:bg-muted',
  ],
  variants: {
    isFocusVisible: { true: 'ring-3 ring-ring/50' },
  },
})

export interface NumberFieldProps extends Omit<AriaNumberFieldProps, 'children'>, FieldLook {
  /** The name of the field, above the box. Without one, pass `aria-label`. */
  label?: string | undefined
  /** One line under the box. */
  description?: string | undefined
  /** Greyed text inside the empty box. Never a substitute for `label`. */
  placeholder?: string | undefined
  /** Shown when validation refuses the value. */
  errorMessage?: string | ((validation: ValidationResult) => string) | undefined
}

/**
 * A number, with steppers.
 *
 * Holds `value`/`onChange` as a number. `minValue`, `maxValue` and `step` clamp
 * it; `formatOptions` takes `Intl.NumberFormat` options for a currency, a
 * percentage or a unit. Arrow keys step the value.
 */
export function NumberField({
  label,
  description,
  placeholder,
  errorMessage,
  size,
  ...props
}: NumberFieldProps) {
  return (
    <AriaNumberField
      data-slot="number-field"
      {...props}
      className={composeClassName(props.className, 'group flex flex-col gap-1.5')}
    >
      {label === undefined ? null : <Label>{label}</Label>}
      <FieldGroup size={size}>
        <GroupInput {...(placeholder === undefined ? {} : { placeholder })} />
        <div className="flex h-full flex-col border-s border-inherit">
          <Stepper slot="increment">
            <ChevronUp aria-hidden className="size-3" />
          </Stepper>
          <div className="border-b border-inherit" />
          <Stepper slot="decrement">
            <ChevronDown aria-hidden className="size-3" />
          </Stepper>
        </div>
      </FieldGroup>
      {description === undefined ? null : <Description>{description}</Description>}
      <FieldError>{errorMessage}</FieldError>
    </AriaNumberField>
  )
}

/** React Aria names the stepper from its `slot` and disables it at the bound. */
function Stepper(props: ButtonProps) {
  return (
    <Button
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        stepper({ ...renderProps, className }),
      )}
    />
  )
}
