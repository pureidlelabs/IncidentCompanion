/**
 * **What a run typed at the repository root resolves to.**
 *
 * Without this file a root invocation runs on vitest's defaults and loads no
 * project configuration, so `server/vitest.config.mts` never execs `stack.mjs`
 * and the environment it fills is absent. The server tier then declines for
 * want of a database that is running the whole time, and reports success:
 * `npx vitest run server/test/session-cache.test.ts` answered `3 skipped` and
 * `rc=0` where the same file from `server/` answers `3 passed`.
 *
 * Naming the directory as a project is what makes the path resolve under that
 * directory's own configuration. Vitest does not treat this file as a project,
 * so it adds no further place for a test to live.
 *
 * `ui` is deliberately not here: its configuration defines projects of its own
 * and vitest does not nest them. A ui path typed at the root fails rather than
 * passing quietly, which is the behaviour this file exists to produce.
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ['server'],
  },
})
