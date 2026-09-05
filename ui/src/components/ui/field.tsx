import { TriangleAlertIcon } from 'lucide-react'
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useId,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react'
import {
  FieldError as AriaFieldError,
  Input as AriaInput,
  Label as AriaLabel,
  Group,
  Text,
  composeRenderProps,
  type FieldErrorProps,
  type GroupProps,
  type InputProps,
  type LabelProps,
  type TextProps,
} from 'react-aria-components'
import { tv } from 'tailwind-variants'

import { cn } from '@/lib/cn'
import { Problem } from './problem'
import { composeClassName } from './rac'

// Spelled out, not derived from `VariantProps`: react-docgen-typescript
// cannot follow a generated type, and the docs page loses the prop.
export interface FieldLook {
  /** Height, from the `--control-h-*` scale. */
  size?: 'sm' | 'md' | 'lg' | undefined
}

/**
 * The border a field box wears, keyed on the state React Aria reports.
 */
export const fieldBorderVariants = {
  isFocusWithin: {
    false: 'border-input',
    true: 'border-ring ring-3 ring-ring/50',
  },
  isInvalid: {
    true: 'border-destructive ring-3 ring-destructive/20 dark:border-destructive/50 dark:ring-destructive/40',
  },
  isDisabled: { true: 'border-border bg-input/50 opacity-50 dark:bg-input/80' },
}

/** The bordered box a control sits in. One height per `--control-h-*` step. */
export const fieldGroup = tv({
  base: 'group flex items-center overflow-hidden rounded-lg border bg-transparent outline-none transition-colors dark:bg-input/30',
  variants: {
    ...fieldBorderVariants,
    size: {
      sm: 'h-(--control-h-sm) text-xs',
      // `text-base` down to `text-sm` at the first breakpoint: a 16px control
      // is what stops a phone zooming into the field on focus.
      md: 'h-(--control-h-md) text-base md:text-sm',
      lg: 'h-(--control-h-lg) text-base md:text-sm',
    },
  },
  defaultVariants: { size: 'md' },
})

/** The bare control inside a `FieldGroup`. The box is the group's, not this. */
export const fieldInput =
  'min-w-0 flex-1 bg-transparent px-2.5 py-1 text-ink outline-none placeholder:text-ink-muted disabled:cursor-not-allowed'

/** The name of a control. Nest it in a React Aria field and the wiring is free. */
export function Label({ className, ...props }: LabelProps) {
  return (
    <AriaLabel
      data-slot="label"
      {...props}
      className={cn(
        'flex w-fit cursor-default items-center gap-2 text-sm leading-none font-medium text-ink select-none',
        className,
      )}
    />
  )
}

/** One line under a control, announced through `aria-describedby`. */
export function Description({ className, ...props }: TextProps) {
  return (
    <Text
      data-slot="description"
      {...props}
      slot="description"
      className={cn('text-left text-sm text-ink-muted', className)}
    />
  )
}

/**
 * Why validation refused the value.
 */
export function FieldError(props: FieldErrorProps) {
  return (
    <AriaFieldError
      data-slot="field-error"
      {...props}
      className={composeClassName(props.className, 'text-sm text-destructive')}
    />
  )
}

export interface FieldGroupProps extends GroupProps, FieldLook {}

/** A box holding a control and its adornments: an icon, a stepper, a clear button. */
export function FieldGroup({ size, ...props }: FieldGroupProps) {
  return (
    <Group
      data-slot="field-group"
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        fieldGroup({ ...renderProps, size, className }),
      )}
    />
  )
}

/**
 * The `<input>` inside a `FieldGroup`. Draws no border of its own.
 */
export function GroupInput(props: InputProps) {
  return (
    <AriaInput
      data-slot="input"
      {...props}
      className={composeClassName(props.className, fieldInput)}
    />
  )
}

/**
 * The mark a field carries when an edit has changed it.
 */
export const CHANGED_RAIL = 'border-l-2 border-l-primary pl-2'

/**
 * The mark a row carries when the last submit was refused on it.
 */
export const PROBLEM_RAIL = 'border-l-2 border-l-destructive pl-2'

/**
 * The ink a sentence of advice is drawn in.
 */
export const ADVICE_INK = 'text-amber-700 dark:text-amber-400'

/**
 * The ids a `Field` hands its control.
 */
export interface FieldControlIds {
  /** Absent in `labels="group"`: there is no one control for a label to name. */
  id: string | undefined
  /**
   * The label element, for a control the `<label for>` pairing cannot name.
   */
  'aria-labelledby': string | undefined
  'aria-describedby': string | undefined
  'aria-invalid': boolean
}

/**
 * A label, a control and the slot a problem goes in.
 *
 * The control is a render prop taking the ids it must carry, because the two
 * wirings a hand-rolled field always forgets are the ones nothing renders: a
 * `<label for>` that matches the control's id, and `aria-describedby` pointing
 * at the error - without which a screen reader announces the field as valid
 * and says nothing about why the write was refused. Generating both here means
 * twenty screens cannot each forget them.
 */
export function Field({
  label,
  hint,
  hintLive,
  required,
  hideLabel,
  aside,
  className,
  onBlur,
  children,
  ...rest
}: {
  label: string
  /**
   * Keep the label for the accessibility tree and take it off the screen.
   */
  hideLabel?: boolean | undefined
  /**
   * A consequence the analyst cannot see from the screen, or advice about what
   * they have typed. Never a rationale.
   */
  hint?: string | undefined
  /**
   * Announce the hint politely when it changes.
   */
  hintLive?: boolean | undefined
  problem?: string | undefined
  /**
   * Marks the field the form cannot be submitted without.
   */
  required?: boolean | undefined
  /**
   * Which thing the label names, because only the caller knows.
   */
  labels?: 'control' | 'group'
  /**
   * Lay a group's legend beside its controls rather than above them.
   */
  groupRow?: boolean
  /**
   * Lay the label and its hint in a column beside the control rather than
   * above it.
   */
  aside?: boolean
  className?: string
  /**
   * Focus has left the field.
   */
  onBlur?: (() => void) | undefined
  children: (ids: FieldControlIds) => ReactNode
}) {
  /**
   * **Reserved when the caller can refuse, and only then.**
   */
  const canRefuse = 'problem' in rest
  // **`data-*` reaches the root; nothing else in `rest` does.** `rest` is
  // where `problem` hides so that `'problem' in rest` can tell an absent
  // refusal from an undefined one, and spreading the remainder whole would
  // let any prop land on the element. A handle is the one thing a caller
  // legitimately wants on the outside: `Field` mints no id of its own.
  const { problem, labels = 'control', groupRow = false, ...over } = rest
  const handles = Object.fromEntries(
    Object.entries(over).filter(([key]) => key.startsWith('data-')),
  )
  const marker = required ? (
    // `\u2022` rather than the HTML entity: `&#8226;` reads as a hex colour to
    // `tokens.test.ts`, and that check is right to be blunt.
    <span aria-hidden className="leading-none text-primary">
      {'\u2022'}
    </span>
  ) : null

  const controlId = useId()
  const labelId = useId()
  const descriptionId = useId()
  const errorId = useId()
  const describedBy =
    [hint ? descriptionId : null, canRefuse ? errorId : null].filter(Boolean).join(' ') ||
    undefined

  /* Split from the refusal because `aside` sends them to different columns:
     the hint describes the field and rides with its label, while a refusal is
     about the value that was typed and stays under the control that holds it.
     Everywhere else they are consecutive and `tail` puts them back. */
  const description = (
    <>
      {hint && (
        <Description
          id={descriptionId}
          className={cn(
            'flex items-center gap-2 text-xs',
            hintLive ? ADVICE_INK : 'text-ink-muted',
          )}
          {...(hintLive ? { 'aria-live': 'polite' as const } : {})}
        >
          {hintLive && <TriangleAlertIcon aria-hidden className="size-3.5 shrink-0" />}
          <span>{hint}</span>
        </Description>
      )}
    </>
  )

  const refusal = (
    <>
      {/* **Always mounted when the caller can refuse**, which is the reserved
          height `field.test.tsx` holds. `Problem` itself decides whether
          to announce: empty renders no `role="alert"`. */}
      {canRefuse && <Problem id={errorId}>{problem}</Problem>}
    </>
  )

  const tail = (
    <>
      {description}
      {refusal}
    </>
  )

  const shell = cn('flex max-w-(--field-max) flex-col gap-1', className)

  if (aside && !hideLabel) {
    return (
      // 2fr/3fr rather than a pixel width, which is `dialog-10`'s own 265/423
      // proportion and holds it at whatever width the dialog turns out to be.
      // `items-start`, so a four-line hint does not centre a one-line control
      // against it.
      <div
        className={cn(
          'grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start gap-x-6 gap-y-1',
          className,
        )}
        onBlur={onBlur}
      >
        <div className="flex flex-col gap-0.5">
          <div className="flex items-baseline gap-1">
            <Label id={labelId} htmlFor={controlId} className="leading-tight peer-disabled:opacity-50">
              {label}
            </Label>
            {marker}
          </div>
          {description}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          {children({
            id: controlId,
            'aria-labelledby': labelId,
            'aria-describedby': describedBy,
            'aria-invalid': Boolean(problem),
          })}
          {refusal}
        </div>
      </div>
    )
  }

  if (labels === 'group') {
    return (
      // The className lands on the outer element, which is what the parent
      // grid lays out; the fieldset inside it only stacks the options.
      <div className={shell} onBlur={onBlur}>
        <fieldset
          className={cn(groupRow ? 'flex flex-row items-center gap-2' : 'flex flex-col gap-1')}
        >
          {/* A legend names the set. Each control inside keeps the name it
              carries, which is the whole difference from the branch below. */}
          <legend
            className={cn(
              'flex items-baseline gap-1 text-sm font-medium leading-tight',
              hideLabel && 'sr-only',
            )}
          >
            {label}
            {marker}
          </legend>
          {children({
            id: undefined,
            'aria-labelledby': undefined,
            'aria-describedby': describedBy,
            'aria-invalid': Boolean(problem),
          })}
          {tail}
        </fieldset>
      </div>
    )
  }

  return (
    <div className={shell} onBlur={onBlur} {...handles}>
      {/* **The marker sits beside the label, not inside it.** Inside, it joins
          the label's text content -- so the field's accessible name becomes
          "Title <dot>" and every tool that reads text rather than the
          accessibility tree sees it, this app's own tests included. `required`
          on the control is what actually announces it. */}
      {/* **`min-h-5`, so a required marker cannot move the control under it.**
          Without it the dot's line box takes the label row taller and the
          control lower - two fields side by side in the same plate,
          visibly out of line. The height is the label's own leading, so a row
          with a marker and a row without measure the same. */}
      <div
        className={cn(
          'flex min-h-5 items-baseline gap-1',
          hideLabel && 'sr-only',
        )}
      >
        <Label id={labelId} htmlFor={controlId} className="leading-tight peer-disabled:opacity-50">
          {label}
        </Label>
        {marker}
      </div>
      {/* Only these three ids reach the control, because several call sites
          spread this object onto more than one element. */}
      {children({
        id: controlId,
        'aria-labelledby': labelId,
        'aria-describedby': describedBy,
        'aria-invalid': Boolean(problem),
      })}
      {tail}
    </div>
  )
}

/** The id `FieldItem` minted for its wrapped control, read by `FieldItemLabel`. */
const FieldItemIdContext = createContext<string | undefined>(undefined)

/**
 * One option inside a `labels="group"` field.
 */
export function FieldItem({ className, children, ...props }: ComponentProps<'div'>) {
  const generated = useId()
  const [control, ...rest] = Children.toArray(children)
  const ownId = isValidElement(control) ? (control.props as { id?: string }).id : undefined
  const id = ownId ?? generated
  const wired =
    isValidElement(control) && ownId === undefined
      ? cloneElement(control as ReactElement<{ id?: string }>, { id })
      : control

  return (
    <div className={className} {...props}>
      <FieldItemIdContext.Provider value={id}>
        {wired}
        {rest}
      </FieldItemIdContext.Provider>
    </div>
  )
}

/** The name of the one control inside a `FieldItem`. */
export function FieldItemLabel({ className, ...props }: ComponentProps<'label'>) {
  const id = useContext(FieldItemIdContext)
  return <label htmlFor={id} className={className} {...props} />
}
