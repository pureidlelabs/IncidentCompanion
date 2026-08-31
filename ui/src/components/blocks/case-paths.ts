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
 * `step` is the spelling `parseTimelineScope` reads, so one vocabulary serves
 * the pivot and the timeline's own scope chip.
 */
export function timelinePath(caseId: string, phase?: string): string {
  const base = casePath(caseId, 'timeline')
  if (phase === undefined || phase.trim() === '') return base
  return `${base}?${new URLSearchParams({ step: phase }).toString()}`
}
