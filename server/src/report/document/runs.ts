/**
 * Grouping neighbouring entries that say the same thing: identity and
 * adjacency, with no time window. Anything happening in between splits the run,
 * so a recurrence after the response is never folded into the burst before it.
 *
 * Every renderer that groups calls this one; a second implementation is how the
 * screen and the report disagree about the same case.
 */

/**
 * Neighbouring entries answering to the same key, as runs.
 *
 * **A `null` key never groups**, which is how a caller excludes an entry whose
 * timestamp will not parse - "adjacent" is not a claim that can be made about
 * an entry with no position.
 */
export function consecutiveRuns<T>(entries: readonly T[], key: (one: T) => string | null): T[][] {
  const runs: T[][] = []
  let previous: string | null | undefined
  for (const entry of entries) {
    const current = key(entry)
    const last = runs[runs.length - 1]
    if (last && current !== null && current === previous) {
      last.push(entry)
    } else {
      runs.push([entry])
    }
    previous = current
  }
  return runs
}
