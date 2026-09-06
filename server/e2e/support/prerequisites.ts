/**
 * Refuses a certifying run whose prerequisites are absent, before any spec is collected.
 *
 * **The tier's skips are per-spec, so it could report success having run almost
 * none of itself.** `requireServedApp` skips when no app answers and each
 * `*.storybook.spec.ts` skips when no Storybook does -- both correct for a
 * developer without a stack, and both invisible in an exit code. Against a
 * stack started without Storybook, most of the tier skipped and the reason
 * appeared nowhere in the summary.
 *
 * So the same split the rest of the repository already makes is made once here:
 * a skip is right when exploring, and a failure when the run claims to certify.
 * `mustRun()` is the existing answer to which of the two this is, and it is not
 * re-implemented.
 *
 * **Each config says what it needs**, because the two tiers need different
 * things: the app tier drives Nest, Postgres and Vite, and the kit tier drives
 * Storybook and reaches no server at all. A single check demanding both made a
 * component run wait on a database it never opens.
 *
 * Probing rather than trusting the launcher: `test.sh` and `verify.sh` both
 * checked the API port while `baseURL` resolves to Vite's, so a dead front end
 * passed their check and reached Playwright as a screen that would not draw.
 */
import type { FullConfig } from '@playwright/test'

import { mustRun } from '../../test/must-run.js'

import { STORYBOOK_URL } from '../visual/storybook-url.js'

/** What a config drives, and therefore what it is entitled to refuse over. */
export type Prerequisite = 'app' | 'storybook'

/**
 * Whether something answers within `deadline`, with no opinion about what.
 *
 * **It waits rather than probing once, and that distinction is the whole
 * check.** `webServer` waits on the front end alone, so on an unattended run
 * Storybook is still compiling when this is asked -- and a single probe called
 * a service that was starting a service that was absent, which failed the run
 * for the one reason that was about to stop being true.
 */
async function answers(url: string, deadline: number): Promise<boolean> {
  const until = Date.now() + deadline
  for (;;) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(10_000) })).ok) return true
    } catch {
      // Not up yet, or not up at all. The deadline tells the two apart.
    }
    if (Date.now() >= until) return false
    await new Promise((wake) => setTimeout(wake, 2_000))
  }
}

/**
 * What this run cannot reach, named as a person would go and fix it.
 *
 * The front end is asked for `/`, never a route the SPA owns: every unknown
 * address is answered with the shell, so a 200 on one of those says nothing.
 */
async function missing(baseURL: string, needs: readonly Prerequisite[]): Promise<string[]> {
  const absent: string[] = []
  if (needs.includes('app')) {
    // Short, because `webServer` has already waited on this one: reaching here
    // with no app means it never came up, not that it is still coming up.
    if (!(await answers(`${baseURL}/api/health`, 15_000))) {
      absent.push(`no app answering at ${baseURL} - start one with ./dev-node.sh`)
    } else if (!(await answers(baseURL, 15_000))) {
      absent.push(`${baseURL} serves the API but no front end - run \`npm run build\` in \`ui\``)
    }
  }
  if (needs.includes('storybook') && !(await answers(STORYBOOK_URL, 180_000))) {
    // Long, because it compiles the kit before it answers.
    absent.push(
      `no Storybook at ${STORYBOOK_URL}, so every *.storybook.spec.ts would skip - ` +
        'run `npm run storybook` in `ui`',
    )
  }
  return absent
}

/**
 * A `globalSetup` for a config needing `needs`.
 *
 * @param needs what this config drives, so a tier is never refused over a
 *   service it does not touch.
 * @returns a setup that throws when the run is certifying and a prerequisite is
 *   absent, so the tier reports red rather than green having skipped itself.
 */
export function requiring(...needs: readonly Prerequisite[]) {
  return async function checkPrerequisites(config: FullConfig): Promise<void> {
    if (!mustRun()) return

    const absent = await missing(config.projects[0]?.use.baseURL ?? '', needs)
    if (absent.length === 0) return

    throw new Error(
      `The browser tier cannot reach what it drives:\n  ${absent.join('\n  ')}\n` +
        'This run is certifying (CI or IC_SUITE_MUST_RUN), where a skip is a failure. ' +
        'Raise what is missing, or run without IC_SUITE_MUST_RUN to skip it deliberately.',
    )
  }
}
