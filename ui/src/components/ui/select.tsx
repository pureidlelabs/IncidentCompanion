import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  Button,
  Select as AriaSelect,
  SelectValue,
  composeRenderProps,
  type SelectProps as AriaSelectProps,
  type Key,
  type ValidationResult,
} from 'react-aria-components'
import { tv } from 'tailwind-variants'

import { Description, FieldError, Label } from './field'
import { ListBox } from './list-box'
import { MENU_SURFACE, Popover } from './popover'
import { focusRing } from './rac'

/**
 * A value picked from a fixed list.
 *
 * Rows are `ListBoxItem`. Selection is by `id`, so `selectedKey` and
 * `onSelectionChange` take that key rather than the row's text.
 */
const trigger = tv({
  extend: focusRing,
  base: [
    'flex w-full items-center justify-between gap-1.5 rounded-lg border text-left',
    'bg-transparent pr-2 pl-2.5 text-sm transition-colors select-none',
    'dark:bg-input/30',
    '[&_svg:not([class*=size-])]:size-4',
  ],
  variants: {
    size: {
      sm: 'h-(--control-h-sm) text-xs',
      md: 'h-(--control-h-md)',
      lg: 'h-(--control-h-lg)',
    },
    /**
     * A row that is two lines rather than one.
     *
     * **The `--control-h-*` scale is a height, not a floor**, so a caller
     * drawing a name over a caption crammed both lines into a box measured for
     * one. This turns the scale into a minimum and pads instead, which keeps a
     * one-line select exactly where it was -- the padded box computes back to
     * the same height -- while a two-line one grows.
     *
     * It is opt-in rather than automatic because the fixed height is what keeps
     * a row of controls aligned, and only the caller knows whether its rows
     * carry a second line.
     */
    multiline: { true: 'h-auto py-1.5' },
    isDisabled: { true: 'pointer-events-none opacity-50' },
    isInvalid: {
      true: 'border-destructive dark:border-destructive/50',
      false: 'border-input hover:bg-muted/50 dark:hover:bg-input/50',
    },
  },
  /**
   * The floor a multiline trigger keeps, one per size.
   *
   * `h-auto` and `h-(--control-h-md)` are the same Tailwind property, so the
   * multiline variant wins the merge and the size's height is simply gone --
   * a two-line row would grow correctly and a one-line row would collapse to
   * its text. The minimum is restored per size, so this is a compound rather
   * than one more class on the variant above.
   */
  compoundVariants: [
    { multiline: true, size: 'sm', class: 'min-h-(--control-h-sm)' },
    { multiline: true, size: 'md', class: 'min-h-(--control-h-md)' },
    { multiline: true, size: 'lg', class: 'min-h-(--control-h-lg)' },
  ],
  defaultVariants: { size: 'md' },
})

export interface SelectLook {
  /** Trigger height, from the `--control-h-*` scale. */
  size?: 'sm' | 'md' | 'lg' | undefined
  /**
   * The rows are two lines rather than one.
   *
   * Turns `size` into a floor and pads, so a name over a caption is not
   * crammed into a box measured for one line. Opt-in: the fixed height is what
   * keeps a row of controls aligned.
   */
  multiline?: boolean | undefined
}

export interface SelectProps<T extends object>
  extends Omit<
      AriaSelectProps<T>,
      'children' | 'selectedKey' | 'defaultSelectedKey' | 'onSelectionChange'
    >,
    SelectLook {
  /**
   * The picked row, by `id`. Controlled.
   *
   * Re-declared rather than inherited: React Aria marks its own as deprecated
   * for the multi-select API it gained in 1.20, and no single-mode replacement
   * compiles. Absorbing it here keeps the deprecation out of every call site.
   */
  selectedKey?: Key | null
  /** The row picked at first render, by `id`. */
  defaultSelectedKey?: Key | null
  /** Called with the picked row's `id`. Absorbed for the reason `selectedKey` is. */
  onSelectionChange?: (key: Key | null) => void
  /** Above the trigger. Omit only when an `aria-label` names the control. */
  label?: string
  /** One line under the trigger. */
  description?: string
  /** Shown when validation refuses the value. */
  errorMessage?: string | ((validation: ValidationResult) => string)
  /** Shown in the trigger before anything is picked. */
  placeholder?: string
  items?: Iterable<T>
  children: ReactNode | ((item: T) => ReactNode)
}

export function Select<T extends object>({
  label,
  description,
  errorMessage,
  placeholder,
  items,
  children,
  size,
  multiline,
  ...props
}: SelectProps<T>) {
  return (
    <AriaSelect
      {...props}
      className={composeRenderProps(props.className, (resolved) =>
        ['group flex flex-col gap-1.5', resolved].filter(Boolean).join(' '),
      )}
    >
      {label !== undefined && <Label>{label}</Label>}
      {/* **`isInvalid` comes from the caller, not from `renderProps`.** React
          Aria's `Button` render props carry no such flag, so a variant reading
          them is told the select is fine however the caller marked it, and the
          refused border below is never painted. */}
      <Button
        className={(renderProps) =>
          trigger({ ...renderProps, size, multiline, isInvalid: props.isInvalid })
        }
      >
        {/* `truncate` is `whitespace-nowrap` and would flatten a two-line row
            back to one, which is the thing `multiline` exists to stop. A
            multiline trigger keeps `min-w-0` so its own rows can still
            truncate each line. */}
        <SelectValue
          className={`${multiline ? 'min-w-0' : 'truncate'} data-[placeholder]:text-ink-muted`}
        >
          {({ defaultChildren, isPlaceholder }) =>
            isPlaceholder ? (placeholder ?? 'Select') : defaultChildren
          }
        </SelectValue>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-ink-muted" />
      </Button>
      {description !== undefined && <Description>{description}</Description>}
      <FieldError>{errorMessage}</FieldError>
      {/* `--trigger-width` is React Aria's: the list matches the control it came from. */}
      <Popover className={`w-(--trigger-width) min-w-36 ${MENU_SURFACE}`}>
        <ListBox variant="plain" {...(items === undefined ? {} : { items })}>
          {children}
        </ListBox>
      </Popover>
    </AriaSelect>
  )
}
