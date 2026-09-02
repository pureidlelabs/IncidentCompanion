/**
 * The difference between a suite that declined and a suite that passed.
 *
 * A conditional skip is the right mechanism for a developer without a stack,
 * and this does not remove one. What it adds is a second mode: on a run that
 * claims to certify a branch, declining is a failure.
 */

/**
 * Whether this run is certifying rather than exploring.
 *
 * `CI` because every tier there runs against a stack the workflow raised, and
 * `IC_SUITE_MUST_RUN` for the local runs that certify -- `verify.sh` sets it.
 * A bare `npm run check` sets neither and still skips, which is the case this
 * is careful not to break.
 */
// Read per call rather than once at import, which is what lets this be tested
// at all: a module constant fixes the answer before a case can set anything.
//
// `||`, not `??`: an empty `CI` is not a certifying run, and `??` would take
// it as one answer and never look at `IC_SUITE_MUST_RUN`.
export function mustRun(): boolean {
  return Boolean(process.env['CI'] || process.env['IC_SUITE_MUST_RUN'])
}

/**
 * Declines to run, and throws instead when the run is certifying.
 *
 * Returns `false` so it reads as the condition it replaces:
 * `describe.skipIf(!declined(...))`.
 *
 * @param what the suite or case declining, named as a person would look for it
 * @param because what is missing, specifically enough to go and fix
 * @throws when `MUST_RUN`, so the tier reports red rather than green
 */
export function declined(what: string, because: string): false {
  if (mustRun()) {
    throw new Error(
      `${what} declined to run: ${because}. ` +
        `This run is certifying (CI or IC_SUITE_MUST_RUN), where a skip is a failure. ` +
        `Raise the stack, or run without IC_SUITE_MUST_RUN to skip it deliberately.`,
    )
  }
  return false
}
