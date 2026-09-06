/**
 * Refuses a certifying run whose prerequisites are absent, before any spec is collected.
 *
 * **The tier's skips are per-spec, so the tier as a whole could report success
 * having run almost none of it.** `requireServedApp` skips when no app answers
 * and each `*.storybook.spec.ts` skips when no Storybook does -- both correct
 * for a developer without a stack, and both invisible in an exit code. Against
 * a stack started without Storybook, most of the tier skipped and the reason
 * appeared nowhere in the summary.
 *
 * So the same split the rest of the repository already makes is made once here,
 * for every precondition at once: a skip is right when exploring, and a failure
 * when the run claims to certify. `mustRun()` is the existing answer to which
 * of the two this is, and it is not re-implemented.
 *
 * Probing rather than trusting the launcher: `test.sh` and `verify.sh` both
 * check the API port while `baseURL` resolves to Vite's, so a dead front end
 * passed their check and reached Playwright as a screen that would not draw.
 */
import type { FullConfig } from '@playwright/test'

import { mustRun } from '../../test/must-run.js'

import { STORYBOOK_URL } from '../visual/storybook-url.js'

/**
 * Whether something answers within `deadline`, with no opinion about what.
 *
 * **It waits rather than probing once, and that distinction is the whole
 * check.** `webServer` above waits on the front end alone, so on an unattended
 * run Storybook is still compiling when this is asked -- and a single probe
 * called a service that was starting a service that was absent, which failed
 * the run for the one reason that was about to stop being true.
 */
async function answers(url: string, deadline = 120_000): Promise<boolean> {
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
async function missing(baseURL: string): Promise<string[]> {
  const absent: string[] = []
  // Short, because `webServer` has already waited on this one: reaching here
  // with no app means it never came up, not that it is still coming up.
  if (!(await answers(`${baseURL}/api/health`, 15_000))) {
    absent.push(`no app answering at ${baseURL} - start one with ./dev-node.sh`)
  } else if (!(await answers(baseURL, 15_000))) {
    absent.push(`${baseURL} serves the API but no front end - run \`npm run build\` in \`ui\``)
  }
  // Long, because nothing has waited on this one and it compiles the kit.
  if (!(await answers(STORYBOOK_URL))) {
    absent.push(
      `no Storybook at ${STORYBOOK_URL}, so every *.storybook.spec.ts would skip - ` +
        'run `npm run storybook` in `ui`',
    )
  }
  return absent
}

/**
 * @throws when the run is certifying and a prerequisite is absent, so the tier
 *   reports red rather than green having skipped most of itself.
 */
export default async function checkPrerequisites(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL ?? ''
  if (!mustRun()) return

  const absent = await missing(baseURL)
  if (absent.length === 0) return

  throw new Error(
    `The browser tier cannot reach what it drives:\n  ${absent.join('\n  ')}\n` +
      'This run is certifying (CI or IC_SUITE_MUST_RUN), where a skip is a failure. ' +
      'Raise what is missing, or run without IC_SUITE_MUST_RUN to skip it deliberately.',
  )
}
