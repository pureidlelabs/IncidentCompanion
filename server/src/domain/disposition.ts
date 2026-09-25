/** The `content-disposition` every download is served under. */

/** A filename with no control character and no path separator in it. */
export function safeFilename(name: string): string {
  return name.replace(/\p{Cc}/gu, '').replace(/[/\\]/g, '_').trim()
}

/**
 * Controls that reorder or hide what a file manager shows, so `\u202egpj.exe`
 * cannot be saved looking like `exe.jpg`. The stored name keeps them.
 */
const INVISIBLE = /[\p{Bidi_Control}\u200b-\u200d\u2060\ufeff]/gu

/** The longest name a header carries, in code points; past it the stem is cut and the extension kept. */
const LONGEST = 150

function bounded(name: string): string {
  const points = [...name]
  if (points.length <= LONGEST) return name
  const dot = name.lastIndexOf('.')
  const extension = dot > 0 ? [...name.slice(dot)] : []
  const kept = extension.length < 20 ? extension : []
  return [...points.slice(0, LONGEST - kept.length), ...kept].join('')
}

/**
 * `kind; filename="<ASCII fallback>"; filename*=UTF-8''<the name>` (RFC 6266,
 * RFC 8187), so any name a caller stored reaches the browser intact and a
 * client without RFC 8187 still gets a readable one.
 */
export function contentDisposition(kind: 'attachment' | 'inline', name: string): string {
  const clean = bounded(safeFilename(name).replace(INVISIBLE, '')) || 'download'
  const fallback = clean.replace(/[^\x20-\x7e]|["%\\]/g, '_')
  const encoded = encodeURIComponent(clean).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encoded}`
}
