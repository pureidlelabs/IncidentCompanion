import { ChevronDown } from 'lucide-react'
import { useContext, useEffect, type ComponentProps, type MouseEvent, type ReactNode } from 'react'
import {
  Button,
  ComboBox as AriaComboBox,
  ComboBoxStateContext,
  composeRenderProps,
  type ComboBoxProps as AriaComboBoxProps,
  type Key,
  type ValidationResult,
} from 'react-aria-components'

import { Description, FieldError, FieldGroup, GroupInput, Label } from './field'
import { ListBox } from './list-box'
import { MENU_SURFACE, Popover } from './popover'

/**
 * A text field that filters a list. Use it where a `Select` would be too long
 * to scan.
 *
 * `allowsCustomValue` lets the typed text stand as the value; without it only
 * a listed row can be chosen.
 */

/** Marks the portalled list. Nothing styles it and no gate reads it: it is how
 *  a test and a browser sweep find a list that sits outside the field that
 *  opened it. */
const PORTAL_ATTR = 'data-combobox-portal'

export interface ComboBoxLook {
  /** Control height, from the `--control-h-*` scale. */
  size?: 'sm' | 'md' | 'lg' | undefined
}

export interface ComboBoxProps<T extends object>
  extends Omit<
      AriaComboBoxProps<T>,
      'children' | 'selectedKey' | 'defaultSelectedKey' | 'onSelectionChange'
    >,
    ComboBoxLook {
  /**
   * The picked row, by `id`. Controlled.
   *
   * Re-declared rather than inherited, for the reason `select.tsx` gives: React
   * Aria deprecates its own for the multi-select API, and no single-mode
   * replacement compiles.
   */
  selectedKey?: Key | null
  /** The row picked at first render, by `id`. */
  defaultSelectedKey?: Key | null
  /** Called with the picked row's `id`. Absorbed for the reason `selectedKey` is. */
  onSelectionChange?: (key: Key | null) => void
  /** Above the field. Omit only when an `aria-label` names the control. */
  label?: string
  description?: string
  /** Shown when validation refuses the value. */
  errorMessage?: string | ((validation: ValidationResult) => string)
  placeholder?: string
  items?: Iterable<T>
  children: ReactNode | ((item: T) => ReactNode)
  /**
   * Names the button that opens the list. Give it one wherever a screen
   * carries several combo boxes, since the default names them all alike.
   */
  triggerLabel?: string
  /**
   * Names the list itself. Needed only where the field is named by
   * `aria-label` rather than by `label`.
   */
  listLabel?: string
  /**
   * Attributes for the text box: an `id` a `<label for>` points at, a `data-`
   * marker a test reads. `data-*` is spelled out because React Aria's own
   * `InputProps` does not carry it, and the failure is an excess-property
   * error that reads as the prop being wrong rather than the type being
   * narrow.
   */
  inputProps?: ComponentProps<typeof GroupInput> & Record<`data-${string}`, string | undefined>
  /** Drawn in place of the rows when nothing matches. Needs `allowsEmptyCollection`. */
  emptyState?: ReactNode
  /** Open the list when the box is clicked. Focus alone still does not. */
  openOnInputClick?: boolean
  /**
   * Keep the first row highlighted, so Enter picks it without an ArrowDown.
   *
   * A boolean the caller drives rather than something the component works out:
   * with `items` controlled React Aria does no filtering, so only the caller
   * knows whether the box holds a query or a picked row's own label.
   */
  autoHighlight?: boolean
}

/**
 * Restores the highlight React Aria clears on every keystroke.
 *
 * `useComboBoxState` sets the focused key to null whenever the input text
 * changes, and syncs its own `lastValue` in the same effect, so the key can
 * only be re-set on the render after that one. This effect carries no
 * dependency array for that reason.
 */
function AutoHighlight() {
  const state = useContext(ComboBoxStateContext)
  useEffect(() => {
    if (state?.isOpen !== true) return
    if (state.selectionManager.focusedKey != null) return
    const first = state.collection.getFirstKey()
    if (first != null) state.selectionManager.setFocusedKey(first)
  })
  return null
}

/**
 * The box, with the click that opens the list.
 *
 * React Aria opens on input and on the trigger, never on a click into the
 * field. Tabbing in still does not open it, which is the pair this project
 * read in the browser tier.
 */
function ComboBoxInput({
  openOnClick,
  ...props
}: ComponentProps<typeof GroupInput> & { openOnClick: boolean }) {
  const state = useContext(ComboBoxStateContext)
  return (
    <GroupInput
      {...props}
      onClick={(event: MouseEvent<HTMLInputElement>) => {
        props.onClick?.(event)
        if (openOnClick && state !== null && !state.isOpen) state.open(null, 'manual')
      }}
    />
  )
}

export function ComboBox<T extends object>({
  label,
  description,
  errorMessage,
  placeholder,
  items,
  children,
  size,
  triggerLabel,
  listLabel,
  inputProps,
  emptyState,
  openOnInputClick = false,
  autoHighlight = false,
  ...props
}: ComboBoxProps<T>) {
  return (
    <AriaComboBox
      {...props}
      className={composeRenderProps(props.className, (resolved) =>
        ['group flex flex-col gap-1.5', resolved].filter(Boolean).join(' '),
      )}
    >
      {autoHighlight && <AutoHighlight />}
      {label !== undefined && <Label>{label}</Label>}
      <FieldGroup size={size}>
        <ComboBoxInput
          openOnClick={openOnInputClick}
          {...(placeholder === undefined ? {} : { placeholder })}
          {...inputProps}
        />
        <Button
          aria-label={triggerLabel ?? 'Show suggestions'}
          className="mr-1 flex size-6 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-accent hover:text-on-accent"
        >
          <ChevronDown aria-hidden className="size-4" />
        </Button>
      </FieldGroup>
      {description !== undefined && <Description>{description}</Description>}
      <FieldError>{errorMessage}</FieldError>
      {/* `--trigger-width` is React Aria's: the list matches the field it came from. */}
      <Popover
        {...{ [PORTAL_ATTR]: '' }}
        className={`w-(--trigger-width) max-h-72 min-w-36 ${MENU_SURFACE}`}
      >
        <ListBox
          variant="plain"
          {...(listLabel === undefined
            ? {}
            : // The empty `aria-labelledby` is the whole of it, and `undefined`
              // will not do: `mergeProps` keeps the context's value for any key
              // the caller passes as undefined. React Aria points the list at
              // the field's label element, which does not exist when the field
              // is named by `aria-label` - so the name resolved to the trigger
              // button's, and reading `getByRole('listbox', { name })` found
              // nothing.
              { 'aria-label': listLabel, 'aria-labelledby': '' })}
          {...(items === undefined ? {} : { items })}
          {...(emptyState === undefined ? {} : { renderEmptyState: () => emptyState })}
        >
          {children}
        </ListBox>
      </Popover>
    </AriaComboBox>
  )
}
