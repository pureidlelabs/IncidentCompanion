/**
 * Tags: chips here, one comma-separated string on the wire.
 */

/**
 * One CSV field, as `models.entry_tags` reads it back.
 *
 * Takes `unknown`: the generated types are an assertion and no response on
 * this API carries a schema, so an entry arriving without `tags` has to render
 * as no tags rather than throw inside a row.
 */
export function parseTags(csv: unknown): string[] {
  if (typeof csv !== 'string') return []
  const seen = new Map<string, string>()
  for (const part of csv.split(',')) {
    // `.split(/\s+/)` on a trimmed string, so the interior runs collapse and a
    // tab-separated pair does not survive as one tag containing a tab.
    const tag = part.trim().split(/\s+/).filter(Boolean).join(' ')
    if (tag !== '' && !seen.has(tag.toLowerCase())) seen.set(tag.toLowerCase(), tag)
  }
  return [...seen.values()]
}

/** The CSV string a set of chips is stored as. Normalised, so it round-trips. */
export function serialiseTags(tags: readonly string[]): string {
  return parseTags(tags.join(',')).join(',')
}
