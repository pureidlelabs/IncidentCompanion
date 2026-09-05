/**
 * Reading a policy setting at the moment the control needs it.
 */
import { inArray } from 'drizzle-orm'

import type { Database } from '../db/client.js'
import { installPreferences } from '../db/schema/preferences.js'
import { POLICY_SETTINGS, type PolicyKey } from './keys.js'

export type PolicyValues = Record<PolicyKey, number>

/** Every policy setting, parsed, with the default standing in where needed. */
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
