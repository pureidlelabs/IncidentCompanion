/**
 * Does this text match every word of the query?
 */
export function matchesWords(hay: string, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const lower = hay.toLowerCase()
  return words.every((word) => lower.includes(word))
}
