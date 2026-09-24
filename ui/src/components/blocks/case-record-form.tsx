import { useEffect, useMemo, useRef } from 'react'

import type { Advice } from '@/api/advice'
import type { RowDraft } from '@/api/rowDraft'
import type { Read } from '@/api/rowWrite'
import { fieldsOf, formSpec, type Specs } from '@/api/specs'

import { answered, caseGroupsFor, type CaseGroupKey } from './case-record-groups'
import { useWriterOf } from './detail-grid'
import { FieldControl } from './field-control'
import { FormCell, FormSection, spansRow } from './form-section'
import { FieldConflict } from './merge-review'

/**
 * One pane of the case's own record, as a form.
 *
 * `pane` picks which of the record's groups is drawn: `details` for what the
 * case is and who it is for, `times` for the five stamps the whole
 * investigation is measured against. Both panes are this one block, so the
 * flyout and the tab that draw the same pane cannot disagree about which
 * fields it holds.
 *
 * **The draft is the caller's**, held above whatever mounts and unmounts this
 * pane, so a change still being written survives the analyst moving to
 * another tab. Every field is written when it is left.
 */
export interface CaseRecordFormProps {
  /** The case's fields as the analyst sees them, and the ones they are changing. */
  draft: RowDraft
  /** The case, for naming who wrote a value in dispute. */
  caseId?: string | undefined
  /** The served forms. */
  specs: Specs | undefined
  /** Which pane of the record to draw. */
  pane: CaseGroupKey
  /** The field the cursor goes to once this pane is drawn, by name. */
  focusField?: string | undefined
}

/** Where a case field leaves the form: the fields and the version of the case they were read at. */
export interface CaseWrites {
  save: (values: Record<string, unknown>, read: Read) => Promise<unknown>
}

/** Nothing on this form advises, and nothing on it references another row. */
const NO_ADVICE: Advice = {}
const NO_OPTIONS: ReadonlyMap<string, string> = new Map()

export function CaseRecordForm({ draft, caseId, specs, pane, focusField }: CaseRecordFormProps) {
  const fields = useMemo(() => (specs ? fieldsOf(formSpec(specs, 'CASE_FIELDS')) : []), [specs])
  const groups = useMemo(() => caseGroupsFor(fields, pane), [fields, pane])
  const writerOf = useWriterOf('cases', caseId)

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
      {groups.map((group) => (
        <FormSection
          key={group.key}
          title={group.title}
          icon={group.icon}
          columns={2}
          chip={`${String(answered(draft.view, group.fields))} of ${String(group.fields.length)}`}
        >
          {group.fields.map((field) => (
            <FormCell key={field.name} span={spansRow(field) ? 'row' : 'cell'}>
              <FieldControl
                field={field}
                draft={draft.view}
                refused={draft.problems}
                advice={NO_ADVICE}
                optionsFor={() => NO_OPTIONS}
                suggestions={undefined}
                changed={draft.changed(field.name)}
                onSet={draft.set}
                onLeave={draft.leave}
              />
              <FieldConflict
                draft={draft}
                field={field.name}
                label={field.label}
                by={writerOf}
                className="mt-2"
              />
            </FormCell>
          ))}
        </FormSection>
      ))}
    </div>
  )
}
