/**
 * Where the bare address should go, or nothing when the visitor asked for a
 * screen of their own.
 */
export function landingPath(pathname: string, caseId: string, base: string): string | null {
  const trim = (path: string): string => path.replace(/\/+$/, '')
  if (trim(pathname) !== trim(base)) return null
  return `${trim(base)}/cases/${encodeURIComponent(caseId)}/timeline`
}
