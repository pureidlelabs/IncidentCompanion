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
  testMatch: /storybook\.spec\.ts/,
  // One worker: the probe measures rendered geometry, and a second browser
  // competing for the machine is how a settled reading stops being one.
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  // The whole sweep is one test that walks every story, so the per-test
  // timeout is the run's timeout. `storybook.spec.ts` sets its own.
  timeout: 45 * 60_000,
})
