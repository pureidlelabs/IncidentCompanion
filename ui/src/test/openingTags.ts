/**
 * Every opening tag of one element in a source file, as text.
 *
 * **The tag is parsed, not pattern-matched.** A regex anchored on
 * `className="..."` reads past this app's house style, where a class list is
 * `className={cn(controlBase, '...')}` and an id spread is `{...ids}` - so it
 * sees no attribute that sits after an expression, and none at all on a tag
 * written over five lines. Here the opening tag is walked to its `>` with
 * brace and quote nesting tracked, so any attribute order, any expression
 * between the element name and the attribute, and any line breaks are all seen
 * alike.
 *
 * Stops at the `>` that is outside every quote and every `{}` expression, so
 * `className={cn(a, '>')}` and `onChange={() => { ... }}` do not end the tag
 * early.
 *
 * **Comments are skipped rather than treated as text**, and that is not a
 * refinement: `ImportCaseDialog`'s file input carries a `//` comment reading
 * "jsdom's ... button's own", whose two apostrophes open and close a string
 * state that swallowed the tag's `>` and ran the scan into the *next* field.
 * The sweep reported the wrong file with a real defect present, which is the
 * failure that reads as a true positive. Inside a tag a `//` can only be a
 * comment - a `//` in an attribute value is already inside a quote.
 *
 * **A tag inside a comment is still returned.** Nothing here looks outside the
 * tag, so a caller scanning prose-heavy source strips comments first; the two
 * callers do.
 */
export function openingTags(text: string, name: string): string[] {
  const tags: string[] = []
  const opener = new RegExp(`<${name}(?=[\\s/>])`, 'g')
  let found: RegExpExecArray | null
  while ((found = opener.exec(text)) !== null) {
    let depth = 0
    let quote = ''
    let index = found.index + name.length + 1
    for (; index < text.length; index += 1) {
      const char = text[index]
      if (quote !== '') {
        if (char === '\\') index += 1
        else if (char === quote) quote = ''
        continue
      }
      if (char === '/' && text[index + 1] === '/') {
        const line = text.indexOf('\n', index)
        index = line === -1 ? text.length : line
        continue
      }
      if (char === '/' && text[index + 1] === '*') {
        const end = text.indexOf('*/', index + 2)
        index = end === -1 ? text.length : end + 1
        continue
      }
      if (char === '"' || char === "'" || char === '`') quote = char
      else if (char === '{') depth += 1
      else if (char === '}') depth -= 1
      else if (char === '>' && depth === 0) break
    }
    tags.push(text.slice(found.index, index))
  }
  return tags
}
