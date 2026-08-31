import { VocabSelect } from '@/components/blocks/vocab-select'
import type { FieldSpec, FormSpec } from '@/api/specs'
import { fieldOf } from '@/api/specs'
import { DateTimeInput } from '@/components/ui/datetime-input'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { TextArea } from '@/components/ui/textarea'


/**
 * Case fields, drawn from `CASE_FIELDS` rather than listed by hand.
 *
 * **Both doors that create a case render this**, because they were two
 * hand-written subsets of one schema and had already drifted: the import
 * wizard drew `severity` as a plain text box over a vocabulary the server
 * validates against, so a typo was a 422 after the analyst had walked four
 * phases and ticked rows. A control taken from the spec cannot be spelled
 * wrongly, because the spec is what the write is checked against.
 *
 * **Not `entity-dialog`'s renderer**, which draws a collection row: it
 * carries reference pickers, per-field gating and a column span that a case
 * has no use for. What is shared here is the schema, not the widget.
 *
 * A caller names the fields it wants and their order, since the two doors ask
 * for different subsets -- the wizard seeds severity and a detection time from
 * the incident, and the picker offers a template the case schema knows nothing
 * about.
 */
export interface CaseFieldsProps {
  /** `formSpec(specs, 'CASE_FIELDS')`. */
  form: FormSpec
  /** Which fields to draw, in the order they should read. */
  names: readonly string[]
  values: Readonly<Record<string, string>>
  onChange: (name: string, next: string) => void
  /**
   * A consequence the analyst cannot see from the screen, per field.
   *
   * The served form carries the *form's* help text; a door often has something
   * more specific to say -- "the one thing the incident cannot answer" is true
   * of Customer on the import door and nowhere else.
   */
  hints?: Readonly<Record<string, string | undefined>>
  /** Fields the form cannot be submitted without. */
  required?: readonly string[]
  /** What the form refuses about a field, by name. Spoken once Save is pressed. */
  problems?: Readonly<Record<string, string>>
  /** The one field that takes focus when the door opens. */
  autoFocus?: string
}

export function CaseFields({
  form,
  names,
  values,
  onChange,
  hints = {},
  required = [],
  problems = {},
  autoFocus,
}: CaseFieldsProps) {
  return (
    <>
      {names.map((name) => {
        const spec = fieldOf(form, name)
        if (!spec) return null
        const value = values[name] ?? ''
        const hint = hints[name]
        return (
          <Field
            key={name}
            label={spec.label}
            // A handle for the submit to focus what it refused. `Field` mints
            // no id of its own - Base UI labels the control through context.
            data-field={name}
            {...(hint === undefined ? {} : { hint })}
            {...(required.includes(name) ? { required: true } : {})}
            {...(problems[name] === undefined ? {} : { problem: problems[name] })}
          >
            {(ids) =>
              control(spec, ids, value, (next) => {
                onChange(name, next)
              }, autoFocus === name)
            }
          </Field>
        )
      })}
    </>
  )
}

/**
 * The control a served `kind` asks for.
 *
 * Four kinds, because four is what the case schema uses. A kind arriving here
 * with no branch falls to a text box, which is what the field would have been
 * drawn as by hand anyway -- and is visible on screen rather than absent.
 */
function control(
  spec: FieldSpec,
  ids: { id: string | undefined; 'aria-describedby': string | undefined; 'aria-invalid': boolean },
  value: string,
  onChange: (next: string) => void,
  autoFocus: boolean,
) {
  if (spec.kind === 'select') {
    return (
      <VocabSelect
        {...ids}
        value={value}
        onValueChange={onChange}
        options={spec.options ?? []}
        allowEmpty
      />
    )
  }
  if (spec.kind === 'event_datetime') {
    return <DateTimeInput {...ids} label={spec.label} value={value} onChange={onChange} />
  }
  if (spec.kind === 'textarea') {
    return (
      <TextArea
        {...ids}
        rows={5}
        value={value}
        onChange={onChange}
      />
    )
  }
  return (
    <Input
      {...ids}
      autoFocus={autoFocus}
      required={spec.required === true}
      value={value}
      onChange={(event) => {
        onChange(event.target.value)
      }}
    />
  )
}
