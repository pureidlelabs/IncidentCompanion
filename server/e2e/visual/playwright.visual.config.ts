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

import base from '../playwright.config.js'

export default defineConfig({
  ...base,
  testDir: '.',
  // The sweep and the dialog capture: `npm run visual` runs both, and
  // `npm run e2e` runs neither -- they report rather than assert.
  testMatch: /(sweep|dialogs|advice|narrow|auth|tables|rail-collapsed|one-section|picker-doors|wizard-walk|account|sticky-seam|seamgap)\.spec\.ts/,
  testIgnore: undefined,
  // **The seam check runs in both engines, and everything else in one.**
  // A sticky layer and the content scrolling beneath it are composited
  // per-engine, so a seam that Chromium rounds away is one Gecko can still
  // paint -- a chromium-only reading of it is an answer about one compositor.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testMatch: /sticky-seam\.spec\.ts/,
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testMatch: /(sticky-seam|seamgap)\.spec\.ts/,
    },
  ],
  workers: 1,
  fullyParallel: false,
  // The sweep is minutes by design: every rail section, twice, each waiting
  // for network idle and three settled probe passes.
  timeout: 900_000,
})
