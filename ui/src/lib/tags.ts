/**
 * Tags: chips here, one comma-separated string on the wire.
 *
 * `tags` is one `text` column on every entity, so the wire shape is the
 * storage shape rather than a client convenience: a list is refused, and the
 * string is stored **verbatim**. Nothing server-side rewrites it on write, so
 * normalising before sending is this client's job - an un-normalised string is
 * not wrong-and-corrected, it is stored, and the next reader sees a different
 * list from the one the writer's control was showing.
 *
 * `parseTags`: 1. split on `,`; 2. trim each; 3. drop the empties, so `"a,,b,"`
 * is two tags and `""` is none; 4. collapse each tag's interior whitespace runs
 * to one space; 5. drop a later tag differing from an earlier one only by case,
 * keeping the **first** spelling, which is the one already on screen.
 *
 * `serialiseTags` normalises and joins with `,` and no space, so a value
 * written here re-reads as the identical string.
 *
 * **A tag cannot contain a comma** - the storage shape has one separator and no
 * escape, so typing one splits rather than escapes.
 *
 * **Case folding is `toLowerCase`, not Python's `str.casefold`.** They differ
 * on the sharp s against `ss` and a handful of others, so two spellings the
 * reference app counts as one tag are two here. Matching `casefold` means
 * shipping a folding table for a collision nobody has hit.
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
