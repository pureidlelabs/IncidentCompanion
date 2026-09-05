import type { Ref } from 'react'
import {
  Token as AriaToken,
  TokenField as AriaTokenField,
  TokenInput as AriaTokenInput,
  composeRenderProps,
  type TokenFieldProps as AriaTokenFieldProps,
  type TokenInputProps,
  type TokenProps as AriaTokenProps,
  type TokenFieldValue,
} from 'react-aria-components'
import { tv } from 'tailwind-variants'

import { Description, Label, fieldBorderVariants } from './field'
import { composeClassName } from './rac'

/** The editable box. Borders come from the field set, so it matches an `Input`. */
const tokenInput = tv({
  base: [
    'group w-full rounded-lg border bg-transparent bg-clip-padding px-2.5 py-1',
    'text-sm text-ink transition-colors outline-none dark:bg-input/30',
    '[&[aria-multiline=true]]:min-h-24',
  ],
  variants: {
    isFocused: fieldBorderVariants.isFocusWithin,
    isDisabled: fieldBorderVariants.isDisabled,
  },
})

/** One inline token. `isSelected` is the caret's selection, not a value it holds. */
const token = tv({
  base: [
    'mx-0.5 inline-flex h-[calc(--spacing(5.25))] w-fit items-center justify-center gap-1',
    'rounded-sm px-1.5 text-xs font-medium whitespace-nowrap',
    'bg-muted text-ink outline-none transition-colors selection:bg-transparent',
  ],
  variants: {
    isFocusVisible: { true: 'ring-3 ring-ring/50' },
    isSelected: {
      true: 'bg-primary text-on-primary forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]',
    },
    isDisabled: { true: 'opacity-50 forced-colors:text-[GrayText]' },
  },
})

export interface TokenFieldProps<T extends TokenFieldValue = TokenFieldValue>
  extends Omit<AriaTokenFieldProps<T>, 'children'> {
  /** The name of the field, above the box. Without one, pass `aria-label`. */
  label?: string | undefined
  /** One line under the box. */
  description?: string | undefined
  /** A ref onto the editable box, for placing the caret or measuring it. */
  inputRef?: Ref<HTMLDivElement> | undefined
  /** Renders one token per segment. Called for text segments too. */
  children: TokenInputProps<T>['children']
}

/**
 * A text input whose entries become inline tokens.
 */
export function TokenField<T extends TokenFieldValue = TokenFieldValue>({
  label,
  description,
  inputRef,
  className,
  children,
  ...props
}: TokenFieldProps<T>) {
  return (
    <AriaTokenField<T>
      data-slot="token-field"
      {...props}
      className={composeClassName(className, 'flex w-full flex-col gap-1.5')}
    >
      {label === undefined ? null : <Label>{label}</Label>}
      <AriaTokenInput<T>
        {...(inputRef === undefined ? {} : { ref: inputRef })}
        className={(renderProps) => tokenInput(renderProps)}
      >
        {children}
      </AriaTokenInput>
      {description === undefined ? null : <Description>{description}</Description>}
    </AriaTokenField>
  )
}

export type TokenProps = AriaTokenProps

/** One token inside a `TokenField`. Not editable, and deleted as a unit. */
export function Token(props: TokenProps) {
  return (
    <AriaToken
      data-slot="token"
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        token({ ...renderProps, className }),
      )}
    />
  )
}

export { token as tokenStyles, tokenInput as tokenInputStyles }
