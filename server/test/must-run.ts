/**
 * The difference between a suite that declined and a suite that passed.
 */

/**
 * Whether this run is certifying rather than exploring.
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
 * Whether this run certifies **and** can be expected to hold a compose stack.
 */
export function mustRunWithAStack(): boolean {
  return Boolean(process.env['IC_SUITE_MUST_RUN'])
}

/**
 * Declines to run, and throws instead when the run is certifying.
 *
 * Returns `false` so it reads as the condition it replaces:
 * `describe.skipIf(!declined(...))`.
 *
 * @param what the suite or case declining, named as a person would look for it
 * @param because what is missing, specifically enough to go and fix
 * @param needsAComposeStack set where the case needs a compose project, which
 *   CI has no way to provide -- it raises services as containers instead. Such
 *   a case is armed by `IC_SUITE_MUST_RUN` alone.
 * @throws when the run is certifying, so the tier reports red rather than green
 */
export function declined(
  what: string,
  because: string,
  { needsAComposeStack = false } = {},
): false {
  if (needsAComposeStack ? mustRunWithAStack() : mustRun()) {
    throw new Error(
      `${what} declined to run: ${because}. ` +
        `This run is certifying (${needsAComposeStack ? 'IC_SUITE_MUST_RUN' : 'CI or IC_SUITE_MUST_RUN'}), ` +
        `where a skip is a failure. ` +
        `Raise the stack, or run without IC_SUITE_MUST_RUN to skip it deliberately.`,
    )
  }
  return false
}
