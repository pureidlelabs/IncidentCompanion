/**
 * The component half of the browser tier: Storybook, and no server at all.
 *
 * **Split from `playwright.config.ts` by what it drives, not by what it looks
 * like.** Measured across the ten `*.storybook.spec.ts` files: not one of them
 * reaches `baseURL`, calls `signIn` or navigates a route. They load a story and
 * measure its geometry -- focus rings, sticky heads, clipped text, the action
 * cluster a row reveals. Under the app's config they were nonetheless waiting
 * on Postgres, a pushed schema and a seeded analyst before they could start.
 *
 * **Which is the whole gain: this is a CI job with no services.** It needs a
 * checkout, a Chromium and `npm run storybook`, and it shards like any other.
 * The app tier keeps the database and the seed it genuinely needs.
 *
 * ```bash
 * npm run e2e:kit                         # in server/
 * npx playwright test --config=e2e/playwright.kit.config.ts --shard=1/2
 * ```
 *
 * It extends the app config rather than restating it, so the viewport, the
 * action timeout and the trace policy stay decided in one place. What it
 * replaces is everything that assumes a server.
 */
import { join } from 'node:path'

import { defineConfig } from '@playwright/test'

import base from './playwright.config.js'

import { STORYBOOK_URL } from './visual/storybook-url.js'

export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: '**/*.storybook.spec.ts',
  // The app config ignores the sweeps; nothing here matches them, and inheriting
  // its list would leave a reader looking for a rule that does no work.
  testIgnore: undefined,
  globalSetup: require.resolve('./support/prerequisites.kit.ts'),
  /**
   * **Storybook, and it is the only thing this tier waits on.**
   *
   * `reuseExistingServer` for the same reason the app tier has it: a developer
   * usually has one running, and `storybook dev` would otherwise fail on the
   * port. The timeout is generous because a cold start compiles the kit.
   *
   * **`STORYBOOK_PORT` is passed, and leaving it out cost a whole run.** The
   * `storybook` script falls back to 6006 while `STORYBOOK_URL` derives this
   * worktree's slot from `stack.mjs`, so Storybook came up perfectly on a port
   * nothing was waiting on and the run died on a webServer timeout. It is the
   * same derivation `dev-node.sh` passes for the same reason.
   */
  webServer: {
    command: 'npm run --silent storybook',
    cwd: join(__dirname, '../../ui'),
    url: STORYBOOK_URL,
    env: { STORYBOOK_PORT: new URL(STORYBOOK_URL).port },
    reuseExistingServer: true,
    timeout: 300_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  /**
   * **No `baseURL`, deliberately.** Inheriting the app's would let a spec here
   * navigate to a server this tier does not raise, and fail as though the
   * application were broken. Every URL these specs use is Storybook's own.
   */
  use: { ...base.use, baseURL: undefined },
})
