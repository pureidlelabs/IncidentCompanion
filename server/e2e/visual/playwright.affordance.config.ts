import { defineConfig } from '@playwright/test'

import { densityProjects } from './densities.js'

/**
 * `npm run audit:affordances` -- the capabilities a family of components does
 * not agree about.
 *
 * **Its own config, and its own `.audit.ts` extension.** The behaviour tier
 * collects `**\/*.spec.ts` and the Storybook sweep collects
 * `storybook.spec.ts`; a full run here is tens of minutes, so it must not join
 * either. The extension is what keeps it out rather than an ignore list
 * somebody has to remember to extend.
 *
 * It needs a Storybook and skips with a reason when there is none.
 *
 * ```bash
 * cd ui && npm run storybook          # in another shell
 * cd server && npm run audit:affordances
 *
 * AFFORDANCE_ONLY=data-table npm run audit:affordances
 * ```
 */
export default defineConfig({
  testDir: '.',
  testMatch: /affordance-audit\.audit\.ts/,
  projects: densityProjects(),
  // One worker: the audit drives one page through every component in order,
  // and a second browser competing for this machine turns a hover into a race.
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  // The whole audit is one test walking every component, so the per-test
  // timeout is the run's. The test sets its own.
  timeout: 120 * 60_000,
})
