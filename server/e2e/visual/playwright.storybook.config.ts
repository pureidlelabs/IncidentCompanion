import { defineConfig } from '@playwright/test'

/**
 * `npm run visual:storybook` -- the probe over every Storybook story.
 *
 * **Its own config because its precondition is different.** The sweep next to
 * it drives the running app and needs a served stack; this drives Storybook
 * and needs `cd ui && npm run storybook`. Folding it into
 * `playwright.visual.config.ts` would mean one command with two preconditions,
 * and the half that could not run would look like the half that found nothing.
 *
 * It skips with a reason when no Storybook answers, so a run without one says
 * so rather than passing.
 *
 * ```bash
 * cd ui && npm run storybook          # in another shell
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
  globalSetup: require.resolve('./storybook-warm.ts'),
})
