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
  testMatch: /(sweep|dialogs|advice|narrow|auth|tables|rail-collapsed|one-section|picker-doors|wizard-walk|account)\.spec\.ts/,
  testIgnore: undefined,
  // **One engine, because the spec that wanted two is gone.** A webkit and a
  // firefox project selecting a file that no longer exists is two projects
  // running nothing and reporting success, which is the failure the seam spec
  // was itself withdrawn for.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  workers: 1,
  fullyParallel: false,
  // The sweep is minutes by design: every rail section, twice, each waiting
  // for network idle and three settled probe passes.
  timeout: 900_000,
})
