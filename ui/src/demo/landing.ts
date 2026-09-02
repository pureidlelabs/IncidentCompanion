/**
 * Where the bare address should go, or nothing when the visitor asked for a
 * screen of their own.
 *
 * `base` is passed rather than read from `import.meta.env.BASE_URL`, which is
 * fixed when the bundle is built - so a test cannot vary it, and the published
 * site under a path prefix is the shape most likely to be wrong.
 */
export function landingPath(pathname: string, caseId: string, base: string): string | null {
  const trim = (path: string): string => path.replace(/\/+$/, '')
  if (trim(pathname) !== trim(base)) return null
  return `${trim(base)}/cases/${encodeURIComponent(caseId)}/timeline`
}
