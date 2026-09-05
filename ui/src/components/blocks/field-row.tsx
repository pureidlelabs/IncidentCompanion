import { type ReactNode } from 'react'

import { parseTags } from '@/lib/tags'
import type { FieldSpec } from '@/api/specs'
import { Disclosure, DisclosureHeader, DisclosurePanel } from '@/components/ui/disclosure'
import { splitIso } from '@/components/ui/datetime-input'
import { MISSING_REFERENCE } from '@/components/ui/entity-ref'
import { CHANGED_RAIL, PROBLEM_RAIL } from '@/components/ui/field'
import { cn } from '@/lib/cn'

/**
 * The label column, and the indent lining a disclosed control up under the
 * value beside it. `pl-51` is `w-48` plus the row's `gap-3`, so the two move
 * together.
 */
const LABEL_WIDTH = 'w-48'
const CONTROL_INSET = 'pl-51'

/**
 * One line of a dialog's detail band: what the field holds, and its control
 * one press away.
 *
 * - The value reads on the closed row; only the control is folded away.
 * - Open state is uncontrolled and per row, so it resets with the mount.
 * - The panel stays in the DOM. React Aria hides it with `hidden="until-found"`
 *   instead of unmounting, so anything costly inside renders while closed.
 * - A `problem` takes the summary's place and keeps a destructive rail on the
 *   closed row, without opening it.
 */
export function FieldRow({
  label,
  summary,
  filled,
  changed,
  problem,
  children,
}: {
  label: string
  /** What the field holds, already rendered for reading. */
  summary: string
  /** Whether `summary` is a value or the word standing in for its absence. */
  filled: boolean
  /** Edit mode: this field differs from the row as it was opened. */
  changed?: boolean | undefined
  /** Why the last submit was refused on this field. */
  problem?: string | undefined
  children: ReactNode
}) {
  return (
    <Disclosure
      data-slot="field-row"
      className={cn(
        'border-b border-border/60 last:border-0',
        changed && CHANGED_RAIL,
        problem !== undefined && PROBLEM_RAIL,
      )}
    >
      <DisclosureHeader level={4} className="h-auto py-2 text-sm font-normal">
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <span className={cn(LABEL_WIDTH, 'shrink-0 truncate text-ink-muted')}>
            {label}
          </span>
          {/* Hidden while open, since the control below now says it. A
              refusal stays legible either way: only this line says why the
              value was refused. */}
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-left',
              problem === undefined && 'group-data-[expanded]/disclosure:invisible',
              problem !== undefined
                ? 'text-destructive'
                : filled
                  ? 'text-ink'
                  : 'text-ink-muted/70',
            )}
          >
            {problem ?? summary}
          </span>
        </span>
      </DisclosureHeader>
      <DisclosurePanel className={cn('pr-7', CONTROL_INSET)}>{children}</DisclosurePanel>
    </Disclosure>
  )
}

/**
 * What a field holds, as one line of reading.
 *
 * Returns the text and whether it is a value or the word standing in for an
 * absent one. An unset field gets a word from `emptyWord`, never a dash.
 */
export function summarise<TData>(
  field: FieldSpec<TData>,
  value: unknown,
  labelFor: (id: string) => string | undefined,
): { summary: string; filled: boolean } {
  const absent = { summary: emptyWord(field), filled: false }

  switch (field.kind) {
    case 'checkbox':
      return { summary: value === true ? 'Yes' : 'No', filled: value === true }

    case 'event_datetime': {
      if (typeof value !== 'string' || value === '') return absent
      const { date, time } = splitIso(value)
      return { summary: `${date} ${time} UTC`, filled: true }
    }

    case 'device_select': {
      if (typeof value !== 'string' || value === '') return absent
      return { summary: labelFor(value) ?? MISSING_REFERENCE, filled: true }
    }

    case 'multi_device_select': {
      const ids = Array.isArray(value) ? (value as string[]) : []
      if (ids.length === 0) return absent
      return { summary: ids.map((id) => labelFor(id) ?? MISSING_REFERENCE).join(', '), filled: true }
    }

    case 'tag_select': {
      // `parseTags`, not a local split: it collapses interior whitespace and
      // drops a later tag differing only by case, which is what the chips one
      // press below this line draw.
      const tags = parseTags(value)
      if (tags.length === 0) return absent
      return { summary: tags.join(' \u00b7 '), filled: true }
    }

    default: {
      const text = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
      if (text.trim() === '') return absent
      const shown = field.optionLabels?.[text] ?? text
      return { summary: shown, filled: true }
    }
  }
}

/** The word an unset field reads as, per kind. */
function emptyWord<TData>(field: FieldSpec<TData>): string {
  switch (field.kind) {
    case 'device_select':
    case 'multi_device_select':
      return 'Not linked'
    case 'event_datetime':
      return 'Not recorded'
    case 'tag_select':
      return 'No tags'
    default:
      return 'Not set'
  }
}
