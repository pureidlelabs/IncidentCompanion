import { useMemo, useState, type ReactNode } from 'react'

import { ApiError } from '@/api/client'

import { adviceFor, type Advice } from '@/api/advice'
import {
  byTitle,
  entityTiers,
  footerFields,
  sectionTitles,
  type DetailRow,
} from '@/api/dialogLayout'
import { changedFields, same } from '@/api/entryFields'
import type { CollectionName } from '@/api/model'
import { fieldsOf, sealed, type FieldSpec, type FormSpec } from '@/api/specs'
import { isEmpty, problemsAgainst, problemsIn, type EntitySchema, type Problems } from '@/api/validateDraft'
import { FieldControl } from '@/components/blocks/field-control'
import { FieldRow, summarise } from '@/components/blocks/field-row'
import {
  FoldedGroups,
  FormCell,
  FormSection,
  spansRow,
} from '@/components/blocks/form-section'
import { Button } from '@/components/ui/button'
import { Dialog, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { useHoldRow } from '@/components/blocks/presence'

/** A reference field's options, by the collection it points at. */
export type ReferenceOptions = Readonly<
  Partial<Record<CollectionName, ReadonlyMap<string, string>>>
>

/** Values the case already carries, for the two kinds whose vocabulary is the case. */
export type Suggestions = Readonly<Record<string, readonly string[]>>

type Draft = Record<string, unknown>

/**
 * What the form opens holding: every spec `default`, and nothing else.
 */
export function initialDraft<TData>(form: FormSpec<TData>): Draft {
  const draft: Draft = {}
  for (const field of fieldsOf(form)) {
    if (field.default !== undefined && field.default !== '') draft[field.name] = field.default
  }
  return draft
}

/**
 * The draft, minus everything left empty.
 */
export function filledFields<TData>(draft: Draft): Partial<TData> {
  const out: Draft = {}
  for (const [name, value] of Object.entries(draft)) {
    if (!isEmpty(value)) out[name] = value
  }
  return out as Partial<TData>
}

export interface EntityDialogProps<TData extends object> {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** "Add system" in create mode, "Edit system" from a row's pencil. */
  title: string
  /** The served form: `formSpec(specs.data, 'SYSTEM_FIELDS')`. */
  form: FormSpec<TData>
  references?: ReferenceOptions | undefined
  suggestions?: Suggestions | undefined
  /** The row being corrected. Present switches the dialog to edit. */
  entry?: Partial<TData> | undefined
  /**
   * The filled (create) or changed (edit) fields, once. A cancel never calls
   * this.
   */
  onCreate: (fields: Partial<TData>) => unknown
  /** Which table the row belongs to, so the other analysts see it held. */
  collection?: CollectionName | undefined
  /**
   * The write schema to validate against, for a form whose collection
   * `problemsIn` cannot resolve by name alone -- the timeline's event and
   * activity validate differently by the caller's own state.
   */
  schema?: EntitySchema | undefined
  /**
   * Anything above the first tier, inside the scrolling body -- what a
   * collection needs that its served form does not describe, such as
   * Evidence's file. Scrolls with the form rather than sitting over it.
   */
  lead?: ReactNode | undefined
}

/**
 * One creation dialog for every entity table, driven by the served form spec.
 */
export function EntityDialog<TData extends object>({
  open,
  onOpenChange,
  title,
  form,
  references,
  suggestions,
  entry,
  onCreate,
  collection,
  schema,
  lead,
}: EntityDialogProps<TData>) {
  // The row id is on the entry in edit mode and absent in create mode, which
  // is exactly when there is no row to hold.
  const rowId = (entry as { id?: string } | undefined)?.id
  useHoldRow(collection ?? '', collection ? rowId : undefined, open)

  return (
    // One width for every entity form: the three tiers stack, so the frame has
    // to fit the widest identity value, a 64-character digest. `form.columns`
    // is not consulted - its readers are the timeline dialog and the
    // Start-case pane.
    <Dialog isOpen={open} size="form" onOpenChange={onOpenChange} dialogProps={{ 'aria-label': title }}>
      <DialogHeader
        title={title}
        onClose={() => {
          onOpenChange(false)
        }}
      />
      <CreateBody
        form={form}
        lead={lead}
        references={references}
        suggestions={suggestions}
        entry={entry}
        schema={schema}
        onCreate={onCreate}
        onClose={() => {
          onOpenChange(false)
        }}
      />
    </Dialog>
  )
}

/** Loosely typed on purpose: the caller's return value, not a contract. */
function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' && value !== null && 'then' in value && typeof value.then === 'function'
  )
}

/**
 * A refusal in one line, in the server's own words where it gave any.
 */
function refusalLine(thrown: unknown): string {
  return thrown instanceof ApiError && thrown.message
    ? thrown.message
    : 'The write did not go through. Try it again.'
}

/**
 * The identity tier, in rows.
 */
function identityRows<TData>(fields: FieldSpec<TData>[]): FieldSpec<TData>[][] {
  if (fields.length === 0) return []

  const firstValue = fields.findIndex((one) => one.kind !== 'select')
  const cut = firstValue < 0 ? fields.length : firstValue + 1

  const rest: FieldSpec<TData>[][] = []
  for (const field of fields.slice(cut)) {
    const last = rest.at(-1)
    if (field.fullWidth || !last || last.length === 2 || last[0]?.fullWidth) rest.push([field])
    else last.push(field)
  }
  return [fields.slice(0, cut), ...rest]
}

function CreateBody<TData extends object>({
  form,
  references,
  suggestions,
  entry,
  schema,
  onCreate,
  onClose,
  lead,
}: {
  form: FormSpec<TData>
  lead: ReactNode | undefined
  references: ReferenceOptions | undefined
  suggestions: Suggestions | undefined
  entry: Partial<TData> | undefined
  schema: EntitySchema | undefined
  onCreate: (fields: Partial<TData>) => unknown
  onClose: () => void
}) {
  // Edit opens holding the row's own values: the row already carries real
  // values for everything the form shows.
  const [draft, setDraft] = useState<Draft>(() =>
    entry ? { ...(entry as Draft) } : initialDraft(form),
  )
  /**
   * What the last submit was refused for, by field.
   */
  const [refused, setRefused] = useState<Problems>({})
  /**
   * Why the server would not take the last submit, if it would not.
   */
  const [sendingFailed, setSendingFailed] = useState<string | null>(null)
  /** A submit is out, so the footer says so and cannot fire a second. */
  const [sending, setSending] = useState(false)
  /** The fields the analyst has left, which is when advice starts speaking. */
  const [left, setLeft] = useState<ReadonlySet<string>>(() => new Set())
  const tiers = useMemo(() => entityTiers(form), [form])
  const footer = useMemo(() => footerFields(form), [form])
  const titles = useMemo(() => sectionTitles(form), [form])
  const rows = useMemo(() => identityRows(tiers.identity), [tiers])

  const set = (name: string, value: unknown) => {
    // Both set from the render's own `draft`, never from inside an updater: a
    // `setState` called inside another's updater runs during render.
    // Nothing a gate shuts is cleared here - `sealed` empties it once, at
    // submit, so a misclicked kind does not wipe a stored value silently.
    const next = { ...draft, [name]: value }
    setDraft(next)
    // Re-checked only while something is already refused, so the first
    // keystroke into an untouched form marks nothing.
    if (Object.keys(refused).length > 0) setRefused(problemsFor(next))
  }

  const problemsFor = (candidate: Draft): Problems =>
    schema
      ? problemsAgainst(schema, candidate, entry !== undefined)
      : problemsIn(form.collection, candidate, entry !== undefined)

  /** Whether this field differs from the row as it was opened. Edit only. */
  const changed = (name: string) =>
    entry !== undefined && !same((entry as Draft)[name], draft[name])

  /**
   * The sealed draft the controls are drawn against, so what a control does
   * agrees with what the submit will do.
   */
  const shown = useMemo(() => sealed(fieldsOf(form), draft), [form, draft])

  /**
   * What looks wrong about values the write will accept, for the fields the
   * analyst has already left. Read off the sealed draft, as the controls are.
   */
  const advice: Advice = useMemo(() => {
    const said = adviceFor(form.collection, shown)
    return Object.fromEntries(Object.entries(said).filter(([name]) => left.has(name)))
  }, [form.collection, shown, left])

  const leave = (name: string) => {
    if (left.has(name)) return
    setLeft(new Set(left).add(name))
  }

  // `optionsFor` rather than `references`: the two dialogs hold their
  // reference rows in different shapes.
  const shared = {
    draft: shown,
    refused,
    advice,
    optionsFor: (one: FieldSpec<TData>) => optionsFor(one, references),
    suggestions,
    onSet: set,
    onLeave: leave,
  }

  const submit = () => {
    // Sealed before it is validated: a field behind a shut gate has no meaning
    // for the kind now chosen, so it is emptied first.
    const sending = sealed(fieldsOf(form), draft)
    const problems = problemsFor(sending)
    if (Object.keys(problems).length > 0) {
      setRefused(problems)
      return
    }
    setSendingFailed(null)
    const answer = onCreate(
      entry
        ? changedFields<TData>(entry, sending as Partial<TData>)
        : filledFields<TData>(sending),
    )
    // A caller that answers nothing has already done whatever it does, so the
    // dialog closes as it always did. One that answers a promise is asked how
    // it went before anything is thrown away.
    if (!isThenable(answer)) {
      onClose()
      return
    }
    setSending(true)
    answer.then(
      () => {
        setSending(false)
        onClose()
      },
      (thrown: unknown) => {
        setSending(false)
        setSendingFailed(refusalLine(thrown))
      },
    )
  }

  return (
    // A column, so the body scrolls and the footer cannot be pushed out of the
    // frame: the frame caps the height and a scrolling child keeps the submit
    // reachable.
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <div
        data-slot="create-body"
        className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-4"
      >
        {/* Above the fields, where the eye starts, and inside the dialog so it
            travels with the draft it is about. */}
        {sendingFailed !== null && (
          <p data-slot="create-refused" role="alert" className="text-sm text-destructive">
            {sendingFailed}
          </p>
        )}

        {lead}

        {/* The identity plate: what the row is, on its own ground and in the
            data face. A form declaring no `tier` has no identity tier, and the
            plate is a bordered, tinted box - drawn empty it is a grey bar
            under the title with nothing in it. */}
        {rows.length > 0 && (
          <FormSection title="Identity" hideTitle tone="plate" layout="plain">
            {rows.map((row, index) => (
              <div key={index} className="flex items-start gap-3">
                {row.map((field) => (
                  <FieldControl<TData>
                    key={field.name}
                    field={field}
                    tone="identity"
                    changed={changed(field.name)}
                    className={field.kind === 'select' ? 'w-44 shrink-0' : 'min-w-0 flex-1'}
                    {...shared}
                  />
                ))}
              </div>
            ))}
          </FormSection>
        )}

        {/* The names the schema declares. A tier that opens no section stays
            unheaded, which is what the plate and the first run of assessment
            fields want. */}
        {byTitle(tiers.assessment, titles).map((group) => (
          <FormSection key={group.title} title={group.title} columns={2}>
            {group.fields.map((field) => (
              <FormCell key={field.name} span={spansRow(field) ? 'row' : 'cell'}>
                <FieldControl field={field} changed={changed(field.name)} {...shared} />
              </FormCell>
            ))}
          </FormSection>
        ))}

        {byTitle(
          tiers.detail.map((row) => row.field),
          titles,
        ).map((group) => {
          const inGroup = new Set(group.fields.map((one) => one.name))
          return (
            <FormSection key={group.title} title={group.title} layout="plain" className="gap-2">
              <FoldedGroups>
                {tiers.detail
                  .filter((row) => inGroup.has(row.field.name))
                  .map((row) => (
                    <DetailField
                      key={row.field.name}
                      row={row}
                      changed={[row.field, ...row.gated].some((one) => changed(one.name))}
                      {...shared}
                    />
                  ))}
              </FoldedGroups>
            </FormSection>
          )
        })}
      </div>

      <DialogFooter>
        {/* **The footer band, which the form declares and nothing drew.**
            `footerRow` is on the served field, the event path already reads it
            that way, and this dialog took every field into a tier -- so the
            colour and its two checkboxes sat in the middle of the form. They
            are the settings an analyst leaves alone while filling one in, so
            they belong beside the buttons rather than in the run of fields. */}
        {footer.length > 0 && (
          // `order-last`, because the footer is `flex-col-reverse` below `sm`
          // so its buttons stack primary-first: a band left in DOM order pins
          // to the bottom of the stack, under both buttons, while the tab
          // order still reaches it before either. Ordering it last in the
          // reversed column draws it first, which is where its DOM position
          // says it is.
          <div className="order-last mr-auto flex flex-wrap items-center gap-x-4 gap-y-2 sm:order-none">
            {footer.map((field) => (
              <FieldControl<TData>
                key={field.name}
                field={field}
                changed={changed(field.name)}
                {...shared}
              />
            ))}
          </div>
        )}
        <Button variant="outline" onPress={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="default" isPending={sending}>
          {entry ? 'Save' : 'Create'}
        </Button>
      </DialogFooter>
    </form>
  )
}

/**
 * One folded line of the detail band: the field's value, and its control
 * behind a press.
 */
function DetailField<TData>({
  row: { field, gated },
  draft,
  refused,
  advice,
  optionsFor,
  suggestions,
  changed,
  onSet,
  onLeave,
}: {
  row: DetailRow<TData>
  draft: Draft
  refused: Problems
  advice: Advice
  /** The rows a reference field offers, by id. Same callback `FieldControl` takes. */
  optionsFor: (field: FieldSpec<TData>) => ReadonlyMap<string, string>
  suggestions: Suggestions | undefined
  /** This field or anything it gates differs from the row as it was opened. */
  changed: boolean
  onSet: (name: string, value: unknown) => void
  onLeave: (name: string) => void
}) {
  const summaryOf = (one: FieldSpec<TData>) => {
    const options = optionsFor(one)
    return summarise(one, draft[one.name], (id) => options.get(id))
  }

  const own = summaryOf(field)
  const extra = draft[field.name] === true ? gated.map(summaryOf).filter((one) => one.filled) : []
  const summary = [own.summary, ...extra.map((one) => one.summary)].join('  \u00b7  ')

  const controls = [field, ...gated]

  return (
    <FieldRow
      label={field.label}
      summary={summary}
      filled={own.filled}
      changed={changed}
      problem={controls.map((one) => refused[one.name]).find(Boolean)}
    >
      <div className="flex flex-col gap-3">
        {controls.map((one) => (
          <FieldControl<TData>
            key={one.name}
            field={one}
            draft={draft}
            refused={refused}
            advice={advice}
            optionsFor={optionsFor}
            suggestions={suggestions}
            onLeave={onLeave}
            // The row already drew the label, except where a gate is folded
            // in: an unlabelled checkbox beside a labelled timestamp reads as
            // a stray control.
            bare={one === field && gated.length === 0}
            onSet={onSet}
          />
        ))}
      </div>
    </FieldRow>
  )
}

/**
 * What a reference field offers when the case holds no rows of its target.
 */
const NO_OPTIONS: ReadonlyMap<string, string> = new Map()

function optionsFor<TData>(
  field: FieldSpec<TData>,
  references: ReferenceOptions | undefined,
): ReadonlyMap<string, string> {
  const collection = field.ref?.collection
  if (!collection) return NO_OPTIONS

  const supplied = references?.[collection]
  // Absent and empty look identical on screen and are not: absent is a
  // wiring mistake worth logging, empty is an ordinary case with no rows of
  // that kind yet.
  if (supplied === undefined && import.meta.env.DEV) {
    console.error(
      `[EntityDialog] "${field.name}" references ${collection}, and the ` +
        `section passed no options for it \u2014 every chip will read "(missing reference)".`,
    )
  }
  return supplied ?? NO_OPTIONS
}
