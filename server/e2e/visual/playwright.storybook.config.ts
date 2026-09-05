import { defineConfig } from '@playwright/test'

import { densityProjects } from './densities.js'

/**
 * `npm run visual:storybook` -- the probe over every Storybook story.
 */
export default defineConfig({
  testDir: '.',
  testMatch: /storybook\.spec\.ts/,
  projects: densityProjects(),
  // One worker: the probe measures rendered geometry, and a second browser
  // competing for the machine is how a settled reading stops being one.
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  // The whole sweep is one test that walks every story, so the per-test
  // timeout is the run's timeout. `storybook.spec.ts` sets its own.
  timeout: 45 * 60_000,
})
