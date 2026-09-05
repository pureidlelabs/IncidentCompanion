/**
 * Every opening tag of one element in a source file, as text.
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
