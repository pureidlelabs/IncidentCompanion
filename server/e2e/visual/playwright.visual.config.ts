/**
 * The sweep's own config, so `npm run visual` runs it and `npm run e2e` does not.
 *
 * **It extends the tier's config rather than restating it** - the derived
 * `baseURL`, the self-signed-certificate allowance and the action timeout are
 * all decisions with their own history there, and a second copy would drift
 * from the first the day one of them changes.
 *
 * **One worker, where the tier runs four.** The sweep drives one signed-in
 * page through every section in order; splitting that across workers would
 * produce four browsers competing for one dev stack to capture the same
 * screens, and the captures are the deliverable.
 */
import { defineConfig, devices } from '@playwright/test'

import { densityProjects } from './densities.js'

import base from '../playwright.config.js'

export default defineConfig({
  ...base,
  testDir: '.',
  // These specs report rather than assert, so `npm run visual` runs them and
  // `npm run e2e` runs none of them.
  testMatch: /(sweep|dialogs|advice|narrow|auth|tables|rail-collapsed|one-section|picker-doors|wizard-walk|account)\.spec\.ts/,
  testIgnore: undefined,
  // **One engine.** A project whose `testMatch` selects nothing runs nothing
  // and reports success, so a second and third engine here would be two green
  // projects that captured no screen at all.
  projects: densityProjects(devices['Desktop Chrome']),
  workers: 1,
  fullyParallel: false,
  // The sweep is minutes by design: every rail section, twice, each waiting
  // for network idle and three settled probe passes.
  timeout: 900_000,
})
