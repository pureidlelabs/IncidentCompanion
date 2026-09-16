/**
 * Putting `install_preferences` back the way a file found it.
 *
 * Its own module rather than a function in `app-harness.ts`, because the file
 * that empties the table outright opens a pool instead of booting the app --
 * and importing the harness runs `stack.mjs` as a child process to derive the
 * environment, which a unit test has no reason to pay for. -> `test/database.ts`
 */
import { installPreferences } from '../src/db/schema/preferences.js'
import type { Database } from '../src/db/client.js'
import type { InstallPreferenceRow } from '../src/db/schema/preferences.js'

/**
 * Replaces every row with the ones given.
 *
 * Written rather than asked for through the route: a teardown needing an
 * administrator's session cannot run in a file whose assertions have failed.
 */
export async function putSettingsBack(
  db: Database,
  atBoot: readonly InstallPreferenceRow[],
): Promise<void> {
  // **One transaction, or a failed insert leaves the install with no settings
  // at all** -- wider than the leak this exists to stop, and silent.
  await db.transaction(async (tx) => {
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await tx.delete(installPreferences)
    if (atBoot.length > 0) await tx.insert(installPreferences).values([...atBoot])
  })
}
