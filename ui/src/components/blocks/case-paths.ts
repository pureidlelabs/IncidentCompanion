/**
 * Where a screen inside a case sends the analyst, for the two that are not
 * entity screens -- `api/entityTargets.sectionPathFor` answers for those.
 */

/** A section of a case, by the slug the rail and the router use. */
export function casePath(caseId: string, slug: string): string {
  return `/cases/${encodeURIComponent(caseId)}/${slug}`
}

/**
 * The timeline, optionally narrowed to one kill chain phase.
 *
 * `phase` is the spelling the whole screen uses, so the address and the filter
 * it seeds are one vocabulary. `timeline-phase-link.test.tsx` holds the writer
 * and the reader to it.
 */
export function timelinePath(caseId: string, phase?: string): string {
  const base = casePath(caseId, 'timeline')
  if (phase === undefined || phase.trim() === '') return base
  return `${base}?${new URLSearchParams({ phase }).toString()}`
}
