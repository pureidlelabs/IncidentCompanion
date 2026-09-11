import { COMMAND_PARAM } from '@/lib/command-request'

/** The search key the open report travels on. */
export const REPORT_PARAM = 'report'

/**
 * The report section's query: the open report, a command to run on arrival, and
 * whatever else `search` already carries.
 *
 * **One composer, because the rail and the section both write this address.**
 * Two would differ in which of them drops the spent command, and the one that
 * forgot would hand the screen a command it has already carried out.
 *
 * `search` is what to keep, so the caller decides what counts as the rest of
 * the address: a row on another section's rail passes none of it, because the
 * parameters on screen belong to the section being left rather than to this
 * one.
 *
 * Answers the query without its `?`, empty when nothing is left to say.
 */
export function reportQuery(
  search: string,
  report: string | null,
  command?: string,
): string {
  const params = new URLSearchParams(search)
  // **The command is never carried forward.** It is cleared through
  // `window.history` rather than the router, so a copy taken from the router
  // still names one that has run. -> `specs/report/design.md`
  params.delete(COMMAND_PARAM)
  if (report === null) params.delete(REPORT_PARAM)
  else params.set(REPORT_PARAM, report)
  if (command !== undefined) params.set(COMMAND_PARAM, command)
  return params.toString()
}
