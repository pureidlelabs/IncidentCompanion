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
  /** Height, from the `--spacing-control-*` scale. */
  size?: 'sm' | 'md' | 'lg' | undefined
}

/**
 * The border a field box wears, keyed on the state React Aria reports.
 *
 * Spread into `fieldGroup` and applied on its own by a control that draws a box
 * of another shape, such as a textarea.
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

/** The bordered box a control sits in. One height per `--spacing-control-*` step. */
export const fieldGroup = tv({
  base: 'group flex items-center overflow-hidden rounded-lg border bg-transparent outline-none transition-colors dark:bg-input/30',
  variants: {
    ...fieldBorderVariants,
    size: {
      sm: 'h-control-sm text-xs',
      // `text-base` down to `text-sm` at the first breakpoint: a 16px control
      // is what stops a phone zooming into the field on focus.
      md: 'h-control-md text-base md:text-sm',
      lg: 'h-control-lg text-base md:text-sm',
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
 *
 * Renders nothing while the field is valid. Children may be a string or a
 * function of the `ValidationResult`.
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
 *
 * **Named apart from `components/ui/input.tsx`'s `Input` on purpose.** That
 * one draws its own bordered box for a caller with no surrounding `FieldGroup`
 * -- most of `Field`'s render-prop callers -- and the two are not
 * interchangeable: dropping this one in without a `FieldGroup` around it
 * renders a control with no border, background or height at all.
 * `one-implementation.rule.test.ts` is what keeps the two names apart.
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
 *
 * **A rail rather than a tint.** A background wash on an input reads as a
 * validation state; a 2px rail in the accent reads as "you touched this" and
 * cannot be confused with severity, which is never the accent.
 *
 * One constant because two surfaces draw it - a field in a tier and a row in
 * the detail band - and they had already drifted apart by an offset a day
 * after being written. A caller inside a grid adds its own negative margin, so
 * the rail sits outside the column rather than shifting the control.
 */
export const CHANGED_RAIL = 'border-l-2 border-l-primary pl-2'

/**
 * The mark a row carries when the last submit was refused on it.
 *
 * Beside `CHANGED_RAIL` and the same shape, because the two are one decision:
 * a rail in the accent says *you touched this* and a rail in the destructive
 * says *this is why it would not save*. Written out twice they drift, which
 * is the whole reason the first one was extracted.
 */
export const PROBLEM_RAIL = 'border-l-2 border-l-destructive pl-2'

/**
 * The ink a sentence of advice is drawn in.
 *
 * **A palette colour rather than a token, which is the registry's own idiom.**
 * ReUI's `c-input-22` - a hint that changes as the value is typed, which is
 * exactly this - cycles `text-ink-muted`, `text-amber-500` and
 * `text-destructive` on the message, and `c-input-25` sets a whole focus ring
 * in `emerald-500` the same way. There is no advisory token here to reach for:
 * every amber in `tokens.css` is `--severity-*`, which is *data* colour, and
 * a form hint filed under a detection's colour language is the wrong claim.
 *
 * **The registry's own value does not survive the transplant.** Measured
 * against `--card`: `amber-500` is **2.15:1** in light, well under the 4.5:1
 * text floor, because ReUI's ground is not this app's. The pair here is
 * **5.02:1** light and **10.12:1** dark.
 */
export const ADVICE_INK = 'text-amber-700 dark:text-amber-400'

/**
 * The ids a `Field` hands its control.
 *
 * **Passed rather than read from context, because no RAC field-type primitive
 * spans this Field's whole range of controls.** `TextField`, `Select` and
 * friends each own one kind and wire label/description/error through their
 * own context; a control that serves a select, a combobox, a date-time input,
 * a tags field and a checkbox from one call site sits outside all of them, so
 * the association has to travel as explicit props instead.
 */
export interface FieldControlIds {
  /** Absent in `labels="group"`: there is no one control for a label to name. */
  id: string | undefined
  /**
   * The label element, for a control the `<label for>` pairing cannot name.
   *
   * A React Aria control writes an `aria-labelledby` of its own -- a select
   * points the trigger's at the current value -- and `aria-labelledby`
   * outranks both `aria-label` and the `<label for>`, so a kit control inside
   * a `Field` answers to whatever it holds rather than to the field. Merging
   * this in is what puts the label back in the name, and
   * `vocab-select.test.tsx` is what holds it.
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
 *
 * ```tsx
 * <Field label="Description" problem={error}>
 *   {(ids) => <Input {...ids} value={value} onChange={...} />}
 * </Field>
 * ```
 *
 * `problem` is a message from the server, never design intent. If a control
 * needs a sentence explaining why it works the way it does, the control is
 * wrong.
 *
 * **The field caps at `--container-field`, here rather than per screen.** Controls
 * inside carry `w-full`, so a field in a full-width pane grew with the pane -
 * a five-option TLP select rendering ~600px wide for a ten-character value.
 * A form column is not a content column. A field that genuinely wants the pane
 * (a long note body) passes `className="max-w-none"`, which wins because `cn`
 * merges on the same utility group.
 *
 * **The label and the hint are this file's own `Label` and `Description`**,
 * the same two every single-kind field is built from; only the id plumbing
 * below is bespoke, for the reason `FieldControlIds` gives. `problem` still
 * renders through `Problem` rather than `FieldError`, which reads a
 * validation context this Field has none of.
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
   *
   * For a control whose name is already drawn beside it -- a detail band's
   * folded row draws the label itself, and a second copy inside the fold is
   * the same word twice. **Never a way to ship an unlabelled control**: the
   * `<label for>` pairing is unchanged, so a screen reader announces the field
   * exactly as it would otherwise.
   */
  hideLabel?: boolean | undefined
  /**
   * A consequence the analyst cannot see from the screen, or advice about what
   * they have typed. Never a rationale.
   *
   * **Two kinds of sentence share one line, and `hintLive` is which.** A
   * schema's own hint is fixed and read once; advice appears and changes as a
   * value is edited, so it needs announcing. They share the line because the
   * app has one thing to say under a control and saying both at once is two
   * sentences competing at 12px.
   */
  hint?: string | undefined
  /**
   * Announce the hint politely when it changes.
   *
   * **Polite, never `role="alert"`.** A refusal interrupts: the save failed.
   * Advice arrives every time a field is left, and an interruption per field
   * leaves a screen-reader user tabbing around the form.
   */
  hintLive?: boolean | undefined
  problem?: string | undefined
  /**
   * Marks the field the form cannot be submitted without.
   *
   * **A mark, not a word.** "(required)" after four of five labels is noise;
   * one dot after the one that is tells you the same thing in the space of a
   * character. The control still carries `required`, which is what a screen
   * reader announces - this is for the eye.
   */
  required?: boolean | undefined
  /**
   * Which thing the label names, because only the caller knows.
   *
   * `control` (the default) is one control that has no name of its own: the
   * label names it, and the caller wires the pairing through `id`.
   *
   * `group` is several controls that each carry their own name -- a row of
   * checkboxes, a slider with two thumbs. The label becomes a legend over a
   * `<fieldset>` and names the set; each option supplies its own name, and a
   * caller wanting that name wired by the primitive wraps it in `FieldItem`.
   */
  labels?: 'control' | 'group'
  /**
   * Lay a group's legend beside its controls rather than above them.
   *
   * **For a band that is one line.** The event dialog's footer holds three
   * unlike things - a swatch set and two checkboxes - and the checkboxes ride
   * beside their labels while the set stacked under its legend, so one item in
   * the row was two lines tall and the band never squared off.
   */
  groupRow?: boolean
  /**
   * Lay the label and its hint in a column beside the control rather than
   * above it.
   *
   * The hint moves out from under the control, so a long sentence no longer
   * sets the distance to the next field and every control in the form starts
   * on the same left edge. A column of unlike controls stays scannable.
   *
   * **Needs a `form`-width dialog**, which is a precondition rather than a
   * preference - a `compact` one leaves the hint a column too narrow to hold a
   * sentence, and the arrangement then makes room for prose and has none to
   * give it.
   *
   * Ignored with `hideLabel`, which says the label is already drawn beside the
   * control -- there is nothing to put in the first column.
   */
  aside?: boolean
  className?: string
  /**
   * Focus has left the field.
   *
   * On the root, so it fires once for a field whatever it holds - a lone input,
   * or a combobox with a trigger beside it. React's `onBlur` is `focusout`, so
   * it bubbles; a caller wanting per-control granularity does not want this.
   */
  onBlur?: (() => void) | undefined
  children: (ids: FieldControlIds) => ReactNode
}) {
  /**
   * **Reserved when the caller can refuse, and only then.**
   * `'problem' in rest` is true for `problem={undefined}` and false when the
   * prop is absent, which is exactly the question: a field that can carry a
   * message keeps the room for it, and a field that never can costs nothing.
   * Without this a refusal appears from nothing and pushes everything below it
   * down -- including the button somebody is reaching for.
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

  const shell = cn('flex max-w-field flex-col gap-1', className)

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
 *
 * Scopes a label to the control it wraps, so a row of checkboxes each keeps
 * its own name under a legend that names the set. **The first child is taken
 * to be the control** and given the id `FieldItemLabel` points its `htmlFor`
 * at, unless that child already carries one of its own. The pairing is wired
 * by id: a plain `<label>` wrapping a `button[role=checkbox]` does not
 * reliably name it.
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
