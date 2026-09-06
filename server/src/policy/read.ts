/**
 * Reading a policy setting at the moment the control needs it.
 *
 * **Fresh, not cached, and that is the security decision.** A cached threshold
 * is one that ignores the change an administrator just made: the screen says
 * five failures and the control still allows ten until something restarts. For
 * a bound on a security control, "takes effect on the next deploy" is the same
 * as "not settable".
 *
 * The cost is one small read per act that consults a bound: a failed sign-in, a
 * policy check, and a session written or refreshed. **The session windows put
 * this on the activity report**, which is throttled to one a minute per tab in
 * the browser, so it is still not a read per request. -> `auth.config.ts`,
 * `windowFor`
 *
 * **A stored value that no longer parses is read as the default**, never
 * handed on. These rows outlive the code that wrote them, and a setting whose
 * bounds were tightened in a later version must not keep applying the old
 * looser number.
 */
import { inArray } from 'drizzle-orm'

import type { Database } from '../db/client.js'
import { installPreferences } from '../db/schema/preferences.js'
import { POLICY_SETTINGS, type PolicyKey } from './keys.js'

export type PolicyValues = Record<PolicyKey, number>

export async function readPolicy(db: Database): Promise<PolicyValues> {
  const keys = Object.keys(POLICY_SETTINGS) as PolicyKey[]
  const rows = await db
    .select()
    .from(installPreferences)
    .where(inArray(installPreferences.key, keys))
  const stored = new Map(rows.map((row) => [row.key, row.value]))

  const out = {} as PolicyValues
  for (const key of keys) {
    const parsed = POLICY_SETTINGS[key].schema.safeParse(stored.get(key))
    out[key] = parsed.success ? parsed.data : POLICY_SETTINGS[key].fallback
  }
  return out
}
