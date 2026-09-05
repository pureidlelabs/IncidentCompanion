/**
 * The browser tier, in the language the app is written in.
 */
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

import { defineConfig, devices } from '@playwright/test'

/**
 * Where the app is. A run against an already-started dev server reuses it.
 */
const STACK = (): { apiUrl: string; vitePort: number } =>
  JSON.parse(
    execFileSync('node', [join(__dirname, '../scripts/stack.mjs'), '--json'], {
      encoding: 'utf8',
    }),
  ) as { apiUrl: string; vitePort: number }

/**
 * Where the browser is pointed. **The dev server by default; `dist` on
 * request.**
 *
 * **`VISUAL_TARGET=dist` is what a landing runs**, and the reason is Tailwind
 * rather than tidiness: the build emits only the classes it finds, so a class
 * assembled at runtime can draw in dev and be absent from the bundle. That
 * defect is invisible here and `npm run visual:dist` is where it surfaces.
 * -> `server/e2e/support/app.ts`
 */
const BASE =
  process.env.INCIDENTCOMPANION_E2E_URL ??
  (process.env.VISUAL_TARGET === 'dist'
    ? STACK().apiUrl
    : `http://127.0.0.1:${String(STACK().vitePort)}`)

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  /**
   * **The visual sweep is excluded, and its selftest is not.**
   */
  testIgnore: '**/visual/sweep.spec.ts',
  /**
   * **Parallel, because each worker now has a case of its own.**
   */
  workers: 4,
  fullyParallel: true,
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE,
    /**
     * **Inert against the dev stack, kept for the containerised one.**
     */
    ignoreHTTPSErrors: true,
    /**
     * **Without this a click waits forever.**
     */
    actionTimeout: 15_000,
    // 1440x900 is what the Python sweep measured at, so findings stay comparable.
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  /**
   * **The viewport is repeated here, and that is not redundant.**
   */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
})
