import { useEffect, useMemo, useRef, useState } from 'react'

import type { Advice } from '@/api/advice'
import type { Case } from '@/api/model'
import { fieldsOf, formSpec, type Specs } from '@/api/specs'
import type { Problems } from '@/api/validateDraft'

import { answered, caseGroupsFor, type CaseGroupKey } from './case-record-groups'
import { FieldControl, type Draft } from './field-control'
import { FormCell, FormSection, spansRow } from './form-section'
import { MergeReview } from './merge-review'

/**
 * One pane of the case's own record, as a form.
 *
 * `pane` picks which of the record's groups is drawn: `details` for what the
 * case is and who it is for, `times` for the five stamps the whole
 * investigation is measured against. Both panes are this one block, so the
 * flyout and the tab that draw the same pane cannot disagree about which
 * fields it holds.
 *
 * **Every field writes on blur, against the version the form was drawn at.** A
 * refused write is another analyst having written first, and it is drawn as a
 * merge review above the fields rather than as an error.
 */
export interface CaseRecordFormProps {
  kase: Case | undefined
  /** The served forms. */
  specs: Specs | undefined
  /** Which pane of the record to draw. */
  pane: CaseGroupKey
  /** A write another analyst got in first with, drawn above the fields. */
  refusal?: { field: string; by: string } | undefined
  /** Fields the last submit was refused on, by name. */
  refused?: Problems
  /** The field the cursor goes to once this pane is drawn, by name. */
  focusField?: string | undefined
  /** Omitted in the gallery, where a field is typed into and never sent. */
  writes?: CaseWrites
}

/**
 * Where a case field leaves the form.
 *
 * One member, and it carries the version the form was drawn at rather than
 * re-reading it. Refreshing before a write adopts the other analyst's value as
 * your base, and the version check then passes on a save that should have been
 * a merge review.
 */
export interface CaseWrites {
  save: (field: string, value: unknown, version: number) => Promise<unknown>
}

/** Nothing on this form advises, and nothing on it references another row. */
const NO_ADVICE: Advice = {}
const NO_OPTIONS: ReadonlyMap<string, string> = new Map()
const NO_PROBLEMS: Problems = {}

/**
 * The field the caret is in on this pane, so a repaint never overwrites it. By pane, not by
 * ref: the flyout and the tab draw this block at once, and render may not read a ref.
 */
function focusedField(pane: CaseGroupKey): string | undefined {
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) return undefined
  const form = active.closest<HTMLElement>('[data-part="case-record-form"]')
  if (form?.dataset.pane !== pane) return undefined
  return active.closest<HTMLElement>('[data-field]')?.dataset.field
}

/** The served case as the form holds it: every field by name, and nothing before it is served. */
function draftOf(kase: Case | undefined): Draft {
  return { ...kase }
}

export function CaseRecordForm({
  kase,
  specs,
  pane,
  refusal,
  refused = NO_PROBLEMS,
  focusField,
  writes,
}: CaseRecordFormProps) {
  const fields = useMemo(() => (specs ? fieldsOf(formSpec(specs, 'CASE_FIELDS')) : []), [specs])
  const groups = useMemo(() => caseGroupsFor(fields, pane), [fields, pane])

  const [draft, setDraft] = useState<Draft>(() => draftOf(kase))
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set())
  // The case identity, held so a repaint from another analyst's write rebuilds
  // the draft. The refusal is a prop and survives it -- held as state here it
  // would be wiped by the very event it is reporting.
  const [given, setGiven] = useState(kase)
  /**
   * A served case is merged into the draft, not swapped for it: a touched or focused field keeps
   * what was typed until the server agrees with it. -> #1109
   */
  if (given !== kase) {
    const next = draftOf(kase)
    // A touched field the served case now agrees with follows the server again.
    const held = new Set([...touched].filter((name) => draft[name] !== next[name]))
    const focused = focusedField(pane)
    if (focused !== undefined) held.add(focused)
    for (const name of held) next[name] = draft[name]
    setGiven(kase)
    setDraft(next)
    setTouched(held)
  }

  const was = draftOf(kase)

  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (focusField === undefined) return
    // By handle rather than by ref: which control a field is drawn as is the
    // served kind's business, not this block's.
    root.current
      ?.querySelector<HTMLElement>(
        `[data-field="${focusField}"] :is(input, textarea, select, button)`,
      )
      ?.focus()
    // `groups`, because there is no control to focus until the served spec
    // has arrived and the pane has drawn one.
  }, [focusField, groups])

  return (
    <div ref={root} data-part="case-record-form" data-pane={pane} className="flex flex-col gap-5">
      {refusal && <MergeReview field={refusal.field} by={refusal.by} />}

      {groups.map((group) => (
        <FormSection
          key={group.key}
          title={group.title}
          icon={group.icon}
          columns={2}
          chip={`${String(answered(draft, group.fields))} of ${String(group.fields.length)}`}
        >
          {group.fields.map((field) => (
            <FormCell key={field.name} span={spansRow(field) ? 'row' : 'cell'}>
              <FieldControl
                field={field}
                draft={draft}
                refused={refused}
                advice={NO_ADVICE}
                optionsFor={() => NO_OPTIONS}
                suggestions={undefined}
                changed={touched.has(field.name) && draft[field.name] !== was[field.name]}
                onSet={(name, value) => {
                  setDraft((current) => ({ ...current, [name]: value }))
                }}
                onLeave={(name) => {
                  setTouched((current) => new Set(current).add(name))
                  // `was` is the case as drawn, so this is the field having
                  // actually moved rather than merely having been visited.
                  if (writes && kase && draft[name] !== was[name]) {
                    void writes.save(name, draft[name], kase.version)
                  }
                }}
              />
            </FormCell>
          ))}
        </FormSection>
      ))}
    </div>
  )
}
