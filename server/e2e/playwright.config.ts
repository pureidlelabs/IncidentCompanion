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
   *
   * **`visual/storybook.spec.ts` is excluded for the sweep's reason, and it
   * took arming the tier to see it.** It probes every story in the kit under a
   * thirty-minute budget of its own and reports what it measured - the same
   * shape as the sweep and the same buy of no failure. It was invisible while
   * it skipped for want of a Storybook; the first run that had one sat in it
   * past twenty minutes with four tests still unreported.
   * `npm run visual:storybook` drives it through
   * `visual/playwright.storybook.config.ts`.
   *
   * **`*.storybook.spec.ts` is a tier of its own, not an exclusion.** Measured:
   * none of the ten reaches `baseURL`, `signIn` or any route -- they drive
   * Storybook and nothing else, so under this config they were waiting on a
   * database, a schema and a seeded analyst that none of them opens.
   * `playwright.kit.config.ts` runs them against Storybook alone, which is a CI
   * job with no services at all.
   */
  testIgnore: [
    '**/visual/sweep.spec.ts',
    '**/visual/storybook.spec.ts',
    '**/*.storybook.spec.ts',
  ],
  /**
   * **Parallel, because each worker has a case of its own.**
   *
   * The specs mutate the fixture case they share: `writing.spec` deletes it in
   * teardown, the sweeps press controls that change it, and `two-analysts`
   * asserts exactly two people are in it. Racing those asserts nothing, so
   * `caseTitle()` in `support/app.ts` keys the fixture on `parallelIndex` and
   * a worker never sees another's case.
   *
   * **`fullyParallel` so files split across workers too** - the tier's run
   * time sits in a handful of long sweeps, so per-file parallelism alone
   * leaves one worker holding them while the rest idle.
   *
   * **Four, not `undefined`.** Playwright's default is half the cores, and
   * each worker is a browser plus a share of one Postgres and one Redis, so
   * the default oversubscribes a machine this tier already loads to its core
   * count.
   */
  workers: 4,
  fullyParallel: true,
  reporter: [['list']],
  /**
   * **Refuses a certifying run whose prerequisites are absent**, rather than
   * letting the per-spec skips omit most of the tier behind a zero exit code.
   * It is inert without `CI` or `IC_SUITE_MUST_RUN`.
   */
  globalSetup: require.resolve('./support/prerequisites.app.ts'),
  /**
   * **Starts what this tier drives, so an unattended run can collect it.**
   *
   * `dev-node.sh` is the repository's one launcher and it raises every half at
   * once -- containers, roles, schema, the seeded analyst the specs sign in as,
   * Nest, and Vite. Naming it here rather than restating any of that is what
   * keeps one description of how this application starts.
   *
   * **`reuseExistingServer`, because a developer already has one.** The stack
   * is a foreground watch loop somebody runs in another shell, and starting a
   * second against the same ports would fail on `--strictPort`. So this starts
   * one only when nothing answers, which is the unattended case exactly.
   *
   * **It waits on `BASE` itself, which is the server the specs drive.**
   * `test.sh` and `verify.sh` both probe the API port while `BASE` resolves to
   * Vite's, so a dead front end passed their check and arrived here as a screen
   * that would not draw.
   *
   * **`--keep-data` because this may be reusing somebody's stack.** A default
   * `dev-node.sh` wipes the database first, and doing that underneath a
   * developer's session is a worse surprise than a slower first run. The specs
   * build their own fixtures and the demo content is seeded either way.
   */
  webServer: {
    command: './dev-node.sh --keep-data',
    /**
     * **Anchored, because `cwd` defaults to this config's own directory** --
     * `server/e2e`, not wherever Playwright was invoked. A relative launcher
     * path resolved against it and the run died with `exit code 127`, which
     * reads as a missing script rather than as a wrong working directory.
     */
    cwd: join(__dirname, '../..'),
    url: BASE,
    reuseExistingServer: true,
    // The launcher builds the server, pushes the schema and seeds before Vite
    // answers, and it is a cold `npm run build` on a first run.
    timeout: 300_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
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
    // 1440x900 is what `visual/sweep.ts` measures at, so findings stay comparable.
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  /**
   * **The viewport is repeated here, and that is not redundant.** A project's
   * `use` overrides the top-level one, and `devices['Desktop Chrome']` carries
   * its own 1280x720 - so the 1440x900 declared above reaches nothing on its
   * own, and every box this tier reports comes from a 1280-wide page instead.
   */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
})
