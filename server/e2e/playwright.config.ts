import { join } from 'node:path'

import { defineConfig, devices } from '@playwright/test'

import { APP_URL, DIST_URL } from './support/app-url.js'

/** Where the app is, and where its built bundle is. -> `support/app-url.ts` */
const BASE = APP_URL
const DIST = DIST_URL

/**
 * What this tier does not run, wherever the list is needed.
 *
 * **Named, because a project's `testIgnore` replaces the config's rather than
 * adding to it.**
 */
const NOT_THIS_TIER = [
  '**/visual/sweep.spec.ts',
  // Reports rather than asserts, under a budget of its own: `npm run
  // visual:storybook` is where it runs.
  '**/visual/storybook.spec.ts',
  '**/*.storybook.spec.ts',
]

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
   * **`*.storybook.spec.ts` is a tier of its own, not an exclusion.** Measured:
   * none of the ten reaches `baseURL`, `signIn` or any route -- they drive
   * Storybook and nothing else, so under this config they were waiting on a
   * database, a schema and a seeded analyst that none of them opens.
   * `playwright.kit.config.ts` runs them against Storybook alone, which is a CI
   * job with no services at all.
   */
  testIgnore: NOT_THIS_TIER,
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
   */
  webServer: {
    command: './dev-node.sh',
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
    /**
     * **The one spec that cannot be answered by the dev server.**
     *
     * `first-paint.spec.ts` asserts the stored ground is painted in the first
     * frame. Vite serves no `<link rel="stylesheet">` at all -- it injects CSS
     * from the module graph once the bundle runs -- so the first frames carry
     * `data-theme` with no stylesheet to select a ground from, and the flash
     * the spec exists to catch is unmeasurable rather than absent. Measured
     * against the build, frame one already carries the dark ground.
     *
     * So it drives the server that serves `dist`, and the setup it depends on
     * builds `dist` first. `public/theme.js` and the render-blocking
     * stylesheet together are what make the frame right, and only a built
     * document has the second half.
     */
    { name: 'the built client', testMatch: '**/support/built.setup.ts', use: { baseURL: DIST } },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      testIgnore: [...NOT_THIS_TIER, '**/first-paint.spec.ts'],
    },
    {
      name: 'first paint',
      testMatch: '**/first-paint.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        baseURL: DIST,
      },
      dependencies: ['the built client'],
    },
  ],
})
