/**
 * The two kinds whose vocabulary is the *case* rather than the spec.
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
