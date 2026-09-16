import { fieldOf, shortLabel, type FormSpec } from '@/api/specs'

/**
 * One field's column heading: the screen's own name where it has one, the
 * served label shortened where it does not.
 *
 * A form's label is the question asked while filling the field in; a column
 * header is scanned, so a few are named by the screen instead. An undefined
 * form is a screen drawing before its specs arrive, and the override still
 * answers.
 */
export function labelled<TData>(
  form: FormSpec<TData> | undefined,
  overrides: Readonly<Record<string, string>>,
): (name: string) => string {
  return (name) => overrides[name] ?? shortLabel((form && fieldOf(form, name)?.label) ?? name)
}
