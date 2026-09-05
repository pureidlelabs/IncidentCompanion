import { Search, X } from 'lucide-react'
import type { RefObject } from 'react'
import {
  SearchField as AriaSearchField,
  Button,
  composeRenderProps,
  type ButtonProps,
  type SearchFieldProps as AriaSearchFieldProps,
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

/** The clear button. Hidden while the field is empty, so it never clears nothing. */
const clear = tv({
  base: [
    'me-1.5 flex size-6 shrink-0 items-center justify-center rounded-md',
    'text-ink-muted outline-none transition-colors group-empty:invisible',
    'hover:bg-muted hover:text-ink pressed:bg-muted',
  ],
  variants: {
    isFocusVisible: { true: 'ring-3 ring-ring/50' },
  },
})

export interface SearchFieldProps extends Omit<AriaSearchFieldProps, 'children'>, FieldLook {
  /** The name of the field, above the box. Without one, pass `aria-label`. */
  label?: string | undefined
  /** One line under the box. */
  description?: string | undefined
  /** Greyed text inside the empty box. Never a substitute for `label`. */
  placeholder?: string | undefined
  /** Shown when validation refuses the value. */
  errorMessage?: string | ((validation: ValidationResult) => string) | undefined
  /** The text box itself, for a caller that focuses it from elsewhere. */
  inputRef?: RefObject<HTMLInputElement | null> | undefined
}

/**
 * A search query, with a clear button.
 */
export function SearchField({
  label,
  description,
  placeholder,
  errorMessage,
  size,
  inputRef,
  ...props
}: SearchFieldProps) {
  return (
    <AriaSearchField
      data-slot="search-field"
      {...props}
      className={composeClassName(props.className, 'group flex flex-col gap-1.5')}
    >
      {label === undefined ? null : <Label>{label}</Label>}
      <FieldGroup size={size}>
        <Search aria-hidden className="ms-2.5 size-4 shrink-0 text-ink-muted" />
        <GroupInput
          className="ps-1.5 [&::-webkit-search-cancel-button]:hidden"
          {...(placeholder === undefined ? {} : { placeholder })}
          {...(inputRef === undefined ? {} : { ref: inputRef })}
        />
        <ClearButton />
      </FieldGroup>
      {description === undefined ? null : <Description>{description}</Description>}
      <FieldError>{errorMessage}</FieldError>
    </AriaSearchField>
  )
}

/**
 * React Aria wires the only `Button` inside a `SearchField` to emptying it, and
 * names it "Clear search" in the field's locale.
 */
function ClearButton(props: ButtonProps) {
  return (
    <Button
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        clear({ ...renderProps, className }),
      )}
    >
      <X aria-hidden className="size-3.5" />
    </Button>
  )
}
