import { type ReactNode } from 'react'

import type { Advice } from '@/api/advice'
import { gateClosed, type FieldSpec } from '@/api/specs'
import type { Problems } from '@/api/validateDraft'
import { spansRow } from '@/components/blocks/form-section'
import { ReferenceMultiSelect } from '@/components/blocks/reference-select'
import { Checkbox } from '@/components/ui/checkbox'
import { DateTimeInput } from '@/components/ui/datetime-input'
import { EntityCombobox } from '@/components/blocks/entity-combobox'
import { CHANGED_RAIL, Field, Label } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { TextArea } from '@/components/ui/textarea'
import { TagsInput } from '@/components/ui/tags-input'
import { VocabSelect } from '@/components/blocks/vocab-select'
import { cn } from '@/lib/cn'

/** What a draft holds, by field name. */
export type Draft = Record<string, unknown>

/** Values a field offers as you type, by field name. */
export type Suggestions = Record<string, readonly string[]>

/** The id bundle `Field` hands its control, plus the gate every arm honours. */
export interface ControlIds {
  id?: string | undefined
  'aria-describedby'?: string | undefined
  'aria-invalid'?: boolean | undefined
  disabled?: boolean | undefined
}

/**
 * One served field, as whatever control its `kind` declares.
 *
 * - `override` is asked inside the `Field`, so a caller's own control keeps
 *   the label, the hint and the refusal slot around it. Answer `null` to fall
 *   through to the shared arm.
 * - `checkbox` and `color` return before the `Field` and cannot be overridden.
 * - A shut gate (`enabledBy`, `applicableWhen`) rides the id bundle, so every
 *   arm honours it without writing `disabled` per case.
 * - An unrecognised kind falls back to a text box, which posts a string.
 *   `specs.test.ts` holds this switch against the served `field_kinds`.
 */
export function FieldControl<TData>({
  field,
  draft,
  refused,
  advice,
  optionsFor,
  suggestions,
  tone = 'form',
  override,
  labels,
  bare = false,
  changed = false,
  className,
  onSet,
  onLeave,
}: {
  field: FieldSpec<TData>
  draft: Draft
  refused: Problems
  /** What looks wrong about a value the write will accept. Never blocks one. */
  advice: Advice
  /** The rows a reference field offers, by id. */
  optionsFor: (field: FieldSpec<TData>) => ReadonlyMap<string, string>
  suggestions: Suggestions | undefined
  /** Draw this kind the caller's own way, or `null` to use the shared arm. */
  override?: ((field: FieldSpec<TData>, ids: ControlIds) => ReactNode) | undefined
  /** Force how the label names what is under it. Defaults to `group` for a
   *  multi-reference, which draws several named controls under one label. */
  labels?: 'control' | 'group' | undefined
  /** `identity` renders taller and in the data face: this is the row itself. */
  tone?: 'form' | 'identity'
  /** Inside a detail row, which already drew the label. */
  bare?: boolean | undefined
  /** Edit mode: differs from the row as it was opened. */
  changed?: boolean | undefined
  className?: string | undefined
  onSet: (name: string, value: unknown) => void
  /** The analyst has left this field, which is when its advice starts speaking. */
  onLeave: (name: string) => void
}) {
  const value = draft[field.name]
  // A number is a value: a stored count renders as its digits. `null` stays
  // empty, since unanswered and zero are different answers.
  const text = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
  // Disabled rather than hidden, the same call the server's datetime field
  // makes: hiding jumps the group's height as the gate opens.
  const gated = gateClosed(field, draft)
  const problem = refused[field.name]
  const said = advice[field.name]
  const hint = suggestions?.[field.name]
  const identity = tone === 'identity'
  const span = className ?? ''
  // `-ml-2` so the rail hangs outside the grid column rather than shifting the
  // control 8px right of its neighbours.
  const mark = changed ? cn(CHANGED_RAIL, '-ml-2') : ''

  // A checkbox names itself; a `Field` above it would render the label twice.
  // The gate is honoured here as well, since this arm returns before the id
  // bundle exists. `specs.test.ts` drives every kind against a shut gate.
  if (field.kind === 'checkbox') {
    return (
      <Checkbox
        className={cn(span, mark)}
        isDisabled={gated}
        isSelected={Boolean(value)}
        onChange={(next) => {
          onSet(field.name, next)
        }}
      >
        {field.label}
      </Checkbox>
    )
  }

  if (field.kind === 'color') {
    // Parked: the colour control is a 21-swatch band with a fold, and no form
    // this dialog serves carries one. It draws no control, so a gate has
    // nothing to grey.
    return (
      <div className={cn('flex flex-col gap-1', span, mark)}>
        <Label>{field.label}</Label>
        <p className="text-xs text-ink-muted">Set it after creating the entry.</p>
      </div>
    )
  }

  return (
    <Field
      label={field.label}
      required={field.required}
      // Advice wins the line and the schema's hint has it the rest of the
      // time: two sentences at 12px under one control compete to be read.
      hint={said ?? (bare || (identity && text !== '') ? undefined : field.hint)}
      hintLive={said !== undefined}
      problem={problem}
      // Focus leaving anything inside the field starts its advice speaking. On
      // the root, since a field may hold a combobox and its trigger.
      onBlur={() => {
        onLeave(field.name)
      }}
      hideLabel={bare}
      className={cn(
        span,
        mark,
        (bare || spansRow(field)) && 'max-w-none',
        identity && '[&_input]:h-9 [&_input]:font-mono [&_textarea]:font-mono',
      )}
      // A multi-reference is a set of controls, each carrying its own name, so
      // the label names the group.
      labels={labels ?? (field.kind === 'multi_device_select' ? 'group' : 'control')}
    >
      {(rawIds) => {
        // The gate rides the id bundle every control already spreads, so no
        // arm has to remember a `disabled` of its own.
        const ids = { ...rawIds, disabled: gated }
        const own = override?.(field, ids)
        if (own !== undefined && own !== null) return own
        switch (field.kind) {
          case 'textarea':
            return (
              <TextArea
                {...ids}
                rows={3}
                value={text}
                onChange={(next) => {
                  onSet(field.name, next)
                }}
              />
            )

          case 'select':
            return (
              <VocabSelect
                {...ids}
                value={text}
                onValueChange={(next) => {
                  onSet(field.name, next)
                }}
                options={field.options ?? []}
                optionLabels={field.optionLabels}
              />
            )

          case 'autocomplete': {
            // The datalist needs a definite id to pair with, so it is named
            // rather than assumed.
            const listId = ids.id === undefined ? undefined : `${ids.id}-list`
            return (
              <>
                <Input
                  {...ids}
                  list={hint && hint.length > 0 ? listId : undefined}
                  value={text}
                  onChange={(event) => {
                    onSet(field.name, event.target.value)
                  }}
                />
                {hint && hint.length > 0 && (
                  <datalist id={listId}>
                    {hint.map((option) => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                )}
              </>
            )
          }

          case 'tag_select':
            return (
              <TagsInput
                {...ids}
                label={field.label}
                value={text}
                onChange={(csv) => {
                  onSet(field.name, csv)
                }}
              />
            )

          case 'event_datetime':
            return (
              <DateTimeInput
                {...ids}
                label={field.label}
                value={text}
                onChange={(iso) => {
                  onSet(field.name, iso)
                }}
              />
            )

          case 'device_select':
            return (
              <EntityCombobox
                {...ids}
                label={field.label}
                options={optionsFor(field)}
                value={text}
                onPick={(id) => {
                  onSet(field.name, id)
                }}
              />
            )

          case 'multi_device_select':
            return (
              <ReferenceMultiSelect
                {...ids}
                label={field.label}
                value={Array.isArray(value) ? (value as string[]) : []}
                options={optionsFor(field)}
                target={field.ref?.target ?? ''}
                onChange={(ids_) => {
                  onSet(field.name, ids_)
                }}
              />
            )

          // A count posts a number, and the server's `z.number()` refuses a
          // string. `inputMode` beside `type`: the second gets a numeric
          // keypad on touch, the first stops the browser accepting `1e5`.
          case 'number':
            return (
              <Input
                {...ids}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={text}
                onChange={(event) => {
                  onSet(field.name, event.target.value)
                }}
              />
            )

          default:
            return (
              <Input
                {...ids}
                // `aria-required`, never the native attribute: the native one
                // hands the browser the refusal, and this app refuses in its
                // own words on its own controls.
                aria-required={field.required === true}
                value={text}
                onChange={(event) => {
                  onSet(field.name, event.target.value)
                }}
              />
            )
        }
      }}
    </Field>
  )
}
