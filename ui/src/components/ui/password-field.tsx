import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import {
  TextField as AriaTextField,
  Button,
  composeRenderProps,
  type ButtonProps,
  type TextFieldProps as AriaTextFieldProps,
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

/** The reveal, sized and spaced like `SearchField`'s clear so the two agree. */
const reveal = tv({
  base: [
    'me-1.5 flex size-6 shrink-0 items-center justify-center rounded-md',
    'text-ink-muted outline-none transition-colors',
    'hover:bg-muted hover:text-ink pressed:bg-muted',
  ],
  variants: {
    isFocusVisible: { true: 'ring-3 ring-ring/50' },
  },
})

export interface PasswordFieldProps
  extends Omit<AriaTextFieldProps, 'children' | 'type'>,
    FieldLook {
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
 * A password, with a control that shows it while the analyst reads it back.
 *
 * OWASP ASVS **V2.1.12** asks for a temporary reveal *"on platforms that do
 * not have this as built-in functionality"*; no desktop browser provides one,
 * so it is the application's.
 *
 * Holds `value`/`onChange` as a string, exactly as `TextField` does, and takes
 * no `type` - the field is the type. Set `autoComplete` at the call site:
 * `current-password` where one is being proved, `new-password` where one is
 * being chosen.
 *
 * **The reveal is per field and resets to hidden on every mount.** A form that
 * asks for a password twice has two independent controls, and a remembered
 * "show" would put a credential on screen for whoever opens the screen next.
 */
export function PasswordField({
  label,
  description,
  placeholder,
  errorMessage,
  size,
  ...props
}: PasswordFieldProps) {
  const [shown, setShown] = useState(false)

  return (
    <AriaTextField
      data-slot="password-field"
      {...props}
      type={shown ? 'text' : 'password'}
      className={composeClassName(props.className, 'group flex max-w-(--field-max) flex-col gap-1.5')}
    >
      {label === undefined ? null : <Label>{label}</Label>}
      <FieldGroup size={size}>
        <GroupInput {...(placeholder === undefined ? {} : { placeholder })} />
        <RevealButton
          shown={shown}
          onPress={() => {
            setShown((was) => !was)
          }}
        />
      </FieldGroup>
      {description === undefined ? null : <Description>{description}</Description>}
      <FieldError>{errorMessage}</FieldError>
    </AriaTextField>
  )
}

/**
 * The control's own state is its name: "Show password" while the value is
 * masked says what pressing it does, which is what a screen reader announces.
 */
function RevealButton({ shown, ...props }: ButtonProps & { shown: boolean }) {
  return (
    <Button
      {...props}
      // React Aria's `Button` renders `type="button"`, so this cannot submit
      // the form it sits in. Named here because the hazard is invisible: a
      // bare `<button>` in a `<form>` would post the credential.
      aria-label={shown ? 'Hide password' : 'Show password'}
      aria-pressed={shown}
      className={composeRenderProps(props.className, (className, renderProps) =>
        reveal({ ...renderProps, className }),
      )}
    >
      {shown ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
    </Button>
  )
}
