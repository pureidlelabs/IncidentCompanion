/**
 * The two kinds whose vocabulary is the *case* rather than the spec.
 *
 * `autocomplete` (people already named) and `tag_select` (tags already used)
 * are served with no `options` at all, and this is the only thing that fills
 * them - a form rendered without it offers an empty datalist, so the analyst
 * retypes a tag the case already carries.
 *
 * Built from the collection's own rows, which the screen has already fetched.
 * Sorted, because the order rows happen to be stored in is not an order
 * anyone is scanning for; distinct, because a case with 30 systems and one
 * analyst would otherwise offer that name thirty times.
 */

import { parseTags } from '@/lib/tags'
import { fieldsOf, type FormSpec } from './specs'

export function suggestionsFor<TData>(
  form: FormSpec<TData>,
  rows: readonly TData[],
): Record<string, readonly string[]> {
  const out: Record<string, readonly string[]> = {}
  for (const field of fieldsOf(form)) {
    if (field.kind !== 'autocomplete' && field.kind !== 'tag_select') continue
    const seen = new Set<string>()
    for (const row of rows) {
      const value = (row as Record<string, unknown>)[field.name]
      if (typeof value !== 'string' || value === '') continue
      // A `tag_select` value is one comma-separated string, so the suggestion
      // is a tag and not the whole line the row happens to store.
      for (const each of field.kind === 'tag_select' ? parseTags(value) : [value]) {
        seen.add(each)
      }
    }
    out[field.name] = [...seen].sort((a, b) => a.localeCompare(b))
  }
  return out
}
