/** The `content-disposition` every download is served under. */

/** A filename with no control character and no path separator in it. */
export function safeFilename(name: string): string {
  return name.replace(/[\u0000-\u001f\u007f]/g, '').replace(/[/\\]/g, '_').trim()
}

/**
 * `kind; filename="<ASCII fallback>"; filename*=UTF-8''<the name>` (RFC 6266,
 * RFC 8187), so any name a caller stored reaches the browser intact and a
 * client without RFC 8187 still gets a readable one.
 */
export function contentDisposition(kind: 'attachment' | 'inline', name: string): string {
  const clean = safeFilename(name) || 'download'
  const fallback = clean.replace(/[^\x20-\x7e]|["%\\]/g, '_')
  const encoded = encodeURIComponent(clean).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encoded}`
}
