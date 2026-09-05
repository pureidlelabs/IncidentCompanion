import { defineConfig } from '@playwright/test'

import { densityProjects } from './densities.js'

/**
 * `npm run audit:affordances` -- the capabilities a family of components does
 * not agree about.
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
