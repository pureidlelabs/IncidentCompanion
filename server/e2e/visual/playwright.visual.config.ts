/**
 * The sweep's own config, so `npm run visual` runs it and `npm run e2e` does not.
 */
import { defineConfig, devices } from '@playwright/test'

import { densityProjects } from './densities.js'

import base from '../playwright.config.js'

export default defineConfig({
  ...base,
  testDir: '.',
  // The sweep and the dialog capture: `npm run visual` runs both, and
  // `npm run e2e` runs neither -- they report rather than assert.
  testMatch: /(sweep|dialogs|advice|narrow|auth|tables|rail-collapsed|one-section|picker-doors|wizard-walk|account)\.spec\.ts/,
  testIgnore: undefined,
  // **One engine, because the spec that wanted two is gone.** A webkit and a
  // firefox project selecting a file that no longer exists is two projects
  // running nothing and reporting success, which is the failure the seam spec
  // was itself withdrawn for.
  projects: densityProjects(devices['Desktop Chrome']),
  workers: 1,
  fullyParallel: false,
  // The sweep is minutes by design: every rail section, twice, each waiting
  // for network idle and three settled probe passes.
  timeout: 900_000,
})
