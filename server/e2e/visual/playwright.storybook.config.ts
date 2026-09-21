import { join } from 'node:path'

import { defineConfig } from '@playwright/test'

import { STORYBOOK_URL } from './storybook-url.js'

/**
 * `npm run visual:storybook` -- the probe over every Storybook story.
 *
 * **Its own config because its precondition is different.** The sweep next to
 * it drives the running app and needs a served stack; this drives Storybook.
 * Folding it into `playwright.visual.config.ts` would mean one command with
 * two preconditions, and the half that could not run would look like the half
 * that found nothing.
 *
 * It raises that Storybook itself, so a clean checkout can run it; a session
 * already serving one is reused. Without a `webServer` the only way to run
 * this was to start Storybook by hand in another shell, and a runner has no
 * other shell -- which is why nothing could ask this tier anything. -> #1040
 *
 * A run that cannot reach one refuses rather than skipping when it claims to
 * certify. -> `require-storybook.ts`
 *
 * ```bash
 * cd server && npm run visual:storybook
 *
 * STORYBOOK_STORIES=Blocks,Layouts npm run visual:storybook
 * VISUAL_GROUNDS=dark npm run visual:storybook
 * STORYBOOK_URL=http://localhost:6007 npm run visual:storybook
 * ```
 */
export default defineConfig({
  testDir: '.',
  // **Anchored: every `*.storybook.spec.ts` beside the walk is the kit tier,
  // which `playwright.kit.config.ts` runs.** Unanchored, the pattern reads as
  // one filename and selects all sixteen.
  testMatch: /(?:^|[\\/])storybook\.spec\.ts$/,
  // **One density, and it is 2.** `probe.js` reads the DOM, and the capture is
  // hashed to pair stories that render alike inside one run, so a second ratio
  // re-measures the same numbers -- `test_visual_runs_at_retina.py` holds the
  // exemption to that staying true. The ratio still decides what
  // `STORYBOOK_SHOTS` writes, which is read by eye, and four density projects
  // wrote that file four times with the last one winning.
  use: { deviceScaleFactor: 2 },

  // One worker: the probe measures rendered geometry, and a second browser
  // competing for the machine is how a settled reading stops being one.
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  // A ceiling over the shard timeout `storybook.spec.ts` sets for itself,
  // which is the one that decides.
  timeout: 45 * 60_000,
  /**
   * **A cold Storybook's compile would otherwise land inside the first
   * shard's timer**, and a run killed there used to print nothing at all.
   * Warming happens before any shard starts. -> #286
   */
  // **The same shape `playwright.kit.config.ts` uses**, and the port is derived
  // rather than written down: `stack.mjs` allocates it from the worktree's own
  // path, so a literal is right in one tree and points at a neighbour's in the
  // next.
  webServer: {
    command: 'npm run --silent storybook',
    cwd: join(__dirname, '../../../ui'),
    url: STORYBOOK_URL,
    env: { STORYBOOK_PORT: new URL(STORYBOOK_URL).port },
    reuseExistingServer: true,
    timeout: 300_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  globalSetup: require.resolve('./storybook-warm.ts'),
})
