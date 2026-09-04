import {
  TextField as AriaTextField,
  TextArea as AriaTextArea,
  type TextFieldProps as AriaTextFieldProps,
  type ValidationResult,
} from 'react-aria-components'
import { tv } from 'tailwind-variants'

import { composeClassName } from './rac'
import { Description, FieldError, Label, fieldBorderVariants } from './field'

/**
 * The box, drawn on the textarea itself.
 *
 * Not `fieldGroup`: that carries a fixed `--control-h-*` height, and a textarea
 * is as tall as its `rows`. `isFocused` stands in for the group's
 * `isFocusWithin`, which a bare input does not report.
 */
const box = tv({
  base: [
    'w-full min-h-16 rounded-lg border bg-transparent px-2.5 py-2',
    'text-base text-ink outline-none transition-colors md:text-sm',
    'placeholder:text-ink-muted disabled:cursor-not-allowed dark:bg-input/30',
  ],
  variants: {
    isFocused: fieldBorderVariants.isFocusWithin,
    isInvalid: fieldBorderVariants.isInvalid,
    isDisabled: fieldBorderVariants.isDisabled,
    resize: {
      none: 'resize-none',
      vertical: 'resize-y',
    },
  },
  defaultVariants: { resize: 'vertical' },
})

// Spelled out, not derived from `VariantProps`: react-docgen-typescript
// cannot follow a generated type, and the docs page loses the prop.
export interface TextAreaLook {
  /** Which way the analyst may drag the corner. Defaults to `vertical`. */
  resize?: 'none' | 'vertical'
}

export interface TextAreaProps
  extends Omit<AriaTextFieldProps, 'children' | 'id' | 'aria-labelledby' | 'aria-describedby'>,
    TextAreaLook {
  /**
   * The native spellings a `Field` hands its control, bridged to React Aria's.
   *
   * `Field` gives every control one id bundle, and it is shaped for the
   * platform because most of the controls in it are native. A React Aria
   * control inside one takes the bundle and maps it, which is what
   * `VocabSelect` does a row down -- so a caller writes `{...ids}` and does not
   * have to know which kind of control it is spreading into.
   */
  disabled?: boolean | undefined
  'aria-invalid'?: boolean | undefined
  // The rest of the same bundle. React Aria declares these without `|
  // undefined`, and under `exactOptionalPropertyTypes` a spread whose value is
  // absent is not the same as a key that is missing.
  id?: string | undefined
  'aria-labelledby'?: string | undefined
  'aria-describedby'?: string | undefined
  /** The name of the field, above the box. Without one, pass `aria-label`. */
  label?: string | undefined
  /** One line under the box. */
  description?: string | undefined
  /** Greyed text inside the empty box. Never a substitute for `label`. */
  placeholder?: string | undefined
  /** Shown when validation refuses the value. */
  errorMessage?: string | ((validation: ValidationResult) => string) | undefined
  /** Visible lines. Defaults to 3. */
  rows?: number | undefined
}

/**
 * Several lines of text.
 *
 * A `TextField` underneath, so it holds `value`/`onChange` as a string and
 * disables with `isDisabled`. Enter inserts a newline rather than submitting.
 *
 * **The one multi-line box in the kit**, in a form or out of one. Pass no
 * `label` for a box that a `Field` or a heading already names, and the native
 * `disabled` and `aria-invalid` a `Field` hands its controls are bridged to
 * React Aria's own.
 */
export function TextArea({
  label,
  description,
  placeholder,
  errorMessage,
  resize,
  rows = 3,
  disabled,
  'aria-invalid': ariaInvalid,
  id,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  ...props
}: TextAreaProps) {
  return (
    <AriaTextField
      data-slot="textarea-field"
      {...props}
      {...(disabled === undefined ? {} : { isDisabled: disabled })}
      {...(ariaInvalid === undefined ? {} : { isInvalid: ariaInvalid })}
      {...(id === undefined ? {} : { id })}
      {...(labelledBy === undefined ? {} : { 'aria-labelledby': labelledBy })}
      {...(describedBy === undefined ? {} : { 'aria-describedby': describedBy })}
      className={composeClassName(props.className, 'group flex flex-col gap-1.5')}
    >
      {label === undefined ? null : <Label>{label}</Label>}
      <AriaTextArea
        rows={rows}
        data-slot="textarea"
        {...(placeholder === undefined ? {} : { placeholder })}
        className={(renderProps) => box({ ...renderProps, resize })}
      />
      {description === undefined ? null : <Description>{description}</Description>}
      <FieldError>{errorMessage}</FieldError>
    </AriaTextField>
  )
}
