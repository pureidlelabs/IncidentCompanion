import {
  TextField as AriaTextField,
  type TextFieldProps as AriaTextFieldProps,
  type ValidationResult,
} from 'react-aria-components'

import { composeClassName } from './rac'
import {
  Description,
  FieldError,
  FieldGroup,
  GroupInput,
  Label,
  type FieldLook,
} from './field'

export interface TextFieldProps extends Omit<AriaTextFieldProps, 'children'>, FieldLook {
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
 * One line of text.
 *
 * Holds `value`/`onChange` as a string, and disables with `isDisabled`. Set
 * `type` for an email, a URL or a password; `isInvalid` plus `errorMessage`
 * for a refusal the browser cannot work out for itself.
 */
export function TextField({
  label,
  description,
  placeholder,
  errorMessage,
  size,
  ...props
}: TextFieldProps) {
  return (
    <AriaTextField
      data-slot="text-field"
      {...props}
      className={composeClassName(props.className, 'group flex max-w-(--field-max) flex-col gap-1.5')}
    >
      {label === undefined ? null : <Label>{label}</Label>}
      <FieldGroup size={size}>
        <GroupInput {...(placeholder === undefined ? {} : { placeholder })} />
      </FieldGroup>
      {description === undefined ? null : <Description>{description}</Description>}
      <FieldError>{errorMessage}</FieldError>
    </AriaTextField>
  )
}
