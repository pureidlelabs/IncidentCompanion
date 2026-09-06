import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

import { defineConfig, devices } from '@playwright/test'

/**
 * Where the app is. A run against an already-started dev server reuses it.
 *
 * **Derived, because a literal here tests somebody else's app.** This read
 * `https://127.0.0.1:8124` - the main checkout's port - so a worktree running
 * the browser tier drove whichever stack happened to own 8124, and a *green*
 * run was the dangerous outcome: it certified a tree whose code was never
 * loaded. Same script as `dev-node.sh` and `vitest.config.mts`.
 * See `server/scripts/stack.mjs`.
 *
 * **`__dirname`, not `import.meta`.** Playwright loads this config through a
 * CommonJS wrapper whatever the extension says, so `import.meta.url` throws
 * *"Cannot use import.meta outside a module"* before any test is collected.
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
 * **Vite is the default because it cannot go stale.** A `dist` that was never
 * rebuilt reads as a fix that did not apply, and nothing in the capture says
 * which of the two it was.
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
   *
   * `visual/sweep.spec.ts` captures every section in both grounds and reports
   * what it measured - minutes of wall clock, and it asserts nothing, so
   * running it here would cost the tier its speed and buy no failure.
   * `npm run visual` drives it through `visual/playwright.visual.config.ts`.
   *
   * `visual/selftest.spec.ts` stays in: it is seconds, it asserts, and its
   * trigger is a change to the section action row's markup - which touches
   * neither the probes nor the sweep, so nobody would think to run it by hand.
   */
  testIgnore: '**/visual/sweep.spec.ts',
  /**
   * **Parallel, because each worker now has a case of its own.**
   *
   * It was one worker, and the reason was real: every spec shared one fixture
   * case, `writing.spec` deletes that case in teardown, the sweeps press
   * controls that change it, and `two-analysts` asserts exactly two people are
   * in it. Racing those asserts nothing. `caseTitle()` keys the fixture on
   * `parallelIndex`, so the contention is gone rather than merely tolerated.
   *
   * **`fullyParallel` so files split across workers too** - the tier's run
   * time sits in a handful of long sweeps, so per-file parallelism alone
   * leaves one worker holding them while the rest idle.
   *
   * **Four, not `undefined`.** Playwright's default is half the cores, and
   * each worker is a browser plus a share of one Postgres and one Redis;
   * measured on this machine, the load average was already at the core count
   * during a serial run.
   */
  workers: 4,
  fullyParallel: true,
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE,
    /**
     * **Inert against the dev stack, kept for the containerised one.** This
     * tier drives the server `dev-node.sh` runs, which speaks plaintext since
     * nginx took over TLS -- so there is no handshake to skip and this option
     * does nothing today. It stays because the same specs are the only tier
     * that could be pointed at the compose stack, where the edge serves a
     * self-signed pair. Skipping verification is the harness's own side;
     * nothing on the server is relaxed.
     */
    ignoreHTTPSErrors: true,
    /**
     * **Without this a click waits forever.** `actionTimeout` defaults to 0 -
     * no limit - so a click behind a modal scrim that failed to close is not a
     * failure but a hang, and the test dies on its *own* timeout ten minutes
     * later with no indication of which control it was waiting on.
     *
     * **And it is the only bound on a press; per-call ones are not added
     * back.** A second authority for a quantity declared here buys nothing the
     * diagnosis needs -- a click blocked by an overlay reports the same
     * `intercepts pointer events` message and the same retry log whichever
     * timeout expires.
     *
     * **Raising this is one edit and it is load-bearing in both directions.**
     * `picker.spec.ts` presses 110 controls inside a 300s budget, so a pane
     * whose controls are all blocked exhausts the test before the sweep can
     * report which ones - at 6s it already did for the 59-control snippets
     * pane. A larger number here buys headroom under load and spends the
     * sweep's own budget faster.
     */
    actionTimeout: 15_000,
    // 1440x900 is what the Python sweep measured at, so findings stay comparable.
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  /**
   * **The viewport is repeated here, and that is not redundant.** A project's
   * `use` overrides the top-level one, and `devices['Desktop Chrome']` carries
   * its own 1280x720 - so the 1440x900 declared above was never applied.
   * Measured 2026-08-12: every box this tier reported came from a 1280-wide
   * page while the comment beside the setting said findings were comparable
   * with the Python sweep's. They were not.
   */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
})
