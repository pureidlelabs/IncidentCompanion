/**
 * **`dist` has to be excluded, and the failure it causes is misleading.**
 * `nest build` compiles `*.test.ts` alongside everything else, so without this
 * vitest collects both the source test and its CommonJS twin - and the twin
 * fails with *"Vitest cannot be imported in a CommonJS module using
 * require()"*, which reads as a module-system problem in the test rather than
 * as the same test being run twice from two places.
 *
 * **`globalSetup` gives the suite its own database.** It used to run against
 * whatever `DATABASE_URL` named, which in development is the dev stack's -
 * and the seeder tests delete every case, so running the suite emptied the
 * picker of a running app. See `test/global-setup.ts`.
 */
import { execFileSync } from 'node:child_process'

import { defineConfig } from 'vitest/config'

/**
 * **This worktree's stack, from the one script that derives it.**
 * `dev-node.sh` execs the same file, so the suite cannot end up on a different
 * port from the containers it needs - which presents as Postgres being down
 * rather than as a configuration mismatch.
 *
 * **Exec rather than import**, because the script is the shell's interface too
 * and a second consumer importing it would be testing a surface `dev-node.sh`
 * never uses.
 *
 * An environment variable still wins: an agent handed an explicit
 * `TEST_DATABASE_URL` is pointing somewhere on purpose.
 */
const stack = JSON.parse(
  execFileSync('node', [new URL('scripts/stack.mjs', import.meta.url).pathname, '--json'], {
    encoding: 'utf8',
  }),
) as {
  adminDatabaseUrl: string
  testDatabaseUrl: string
  redisUrl: string
  seedDatabaseUrl: string
}

process.env['ADMIN_DATABASE_URL'] ??= stack.adminDatabaseUrl
process.env['TEST_DATABASE_URL'] ??= stack.testDatabaseUrl
/**
 * **The seeding role, and its absence downgraded a test rather than skipping
 * it.** Every fixture that wants `ic_seed` reads this and falls back to the
 * *app* handle when it is unset - so a test named "the seeder cannot do X"
 * silently asserted it about `ic_app`, which was never allowed to anyway.
 * Found by break-verify: re-granting `TRUNCATE` to `ic_seed` left the test
 * that exists to catch exactly that green.
 */
process.env['SEED_DATABASE_URL'] ??= stack.seedDatabaseUrl
/**
 * **Redis too, and leaving it out was not harmless.** `app-harness.ts` pins
 * its own literal `redis://127.0.0.1:56379` when this is unset, so a
 * worktree's suite started its own Redis, published it, and then wrote every
 * presence key into the *main checkout's* - two agents corrupting each other's
 * keys, and a skip in silence if that instance is down.
 */
process.env['REDIS_URL'] ??= stack.redisUrl

export default defineConfig({
  test: {
    // **Two trees, and the split is Nest's own.** A unit test sits beside the
    // class it covers (`src/**`); a test that boots the app and asserts a
    // property across controllers lives in `test/`, which is where Nest puts
    // its e2e tier. They ran as one glob while `test/` was inside `src/`, so
    // the runner could not tell them apart and neither could a reader.
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    globalSetup: ['./test/global-setup.ts'],
    // The database tests share one Postgres and truncate between cases, so
    // they cannot run beside each other.
    fileParallelism: false,
  },
})
