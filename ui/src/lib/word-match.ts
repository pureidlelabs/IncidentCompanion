/**
 * Does this text match every word of the query?
 *
 * Word-wise rather than substring, so `mer ran` finds "Meridian ransomware"
 * in either order - which is how somebody types a half-remembered title.
 */
export function matchesWords(hay: string, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const lower = hay.toLowerCase()
  return words.every((word) => lower.includes(word))
}
