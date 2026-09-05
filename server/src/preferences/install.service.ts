/**
 * The install's own preferences - everything one analyst changes *for
 * everybody*.
 */
import { Inject, Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { POLICY_SETTINGS } from '../policy/keys.js'

import { OPERATIONAL_FLOOR_DAYS, RETENTION_FLOOR_DAYS } from '../db/schema/install-activity.js'
import { OPERATIONAL_DEFAULT_DAYS, RETENTION_DEFAULT_DAYS } from '../install-activity/prune.service.js'

import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { installPreferences } from '../db/schema/preferences.js'
import { GDPR_SEVERITY_BANDS } from '../domain/vocabularies/compliance.js'
import { DEFAULT_POLICY } from '../domain/compliance-policy.js'

/**
 * Every install preference, its shape and what a fresh install answers.
 */
export const SETTINGS = {
  'compliance.enabled': { schema: z.boolean(), fallback: true },
  'compliance.regime.gdpr': { schema: z.boolean(), fallback: true },
  'compliance.regime.nis2': { schema: z.boolean(), fallback: true },
  'compliance.regime.dora': { schema: z.boolean(), fallback: true },

  /**
   * Which ENISA severity band each GDPR obligation starts at - settable,
   * because ENISA's methodology leaves the mapping to the supervisory
   * authority, and the fallbacks are the common reading.
   */
  'compliance.gdpr.authorityFloor': {
    schema: z.enum(GDPR_SEVERITY_BANDS),
    fallback: DEFAULT_POLICY.authorityFloor,
  },
  'compliance.gdpr.subjectsFloor': {
    schema: z.enum(GDPR_SEVERITY_BANDS),
    fallback: DEFAULT_POLICY.subjectsFloor,
  },

  /**
   * How long the install audit is kept, in days.
   */
  'audit.retentionDays': {
    schema: z.number().int().min(RETENTION_FLOOR_DAYS),
    fallback: RETENTION_DEFAULT_DAYS,
  },

  /**
   * **The security policy, declared in `policy/` and spread in here.**
   */
  ...POLICY_SETTINGS,

  /**
   * The second window, for lines that are volume rather than evidence.
   */
  'audit.operationalRetentionDays': {
    schema: z.number().int().min(OPERATIONAL_FLOOR_DAYS),
    fallback: OPERATIONAL_DEFAULT_DAYS,
  },
} as const

export type SettingKey = keyof typeof SETTINGS

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(SETTINGS, key)
}

@Injectable()
export class InstallPreferencesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Every setting, defaults filled in.
   */
  async all(): Promise<Record<SettingKey, unknown>> {
    const rows = await this.db.select().from(installPreferences)
    const stored = new Map(rows.map((row) => [row.key, row.value]))

    const out = {} as Record<SettingKey, unknown>
    for (const key of Object.keys(SETTINGS) as SettingKey[]) {
      const parsed = SETTINGS[key].schema.safeParse(stored.get(key))
      out[key] = parsed.success ? parsed.data : SETTINGS[key].fallback
    }
    return out
  }

  async get<K extends SettingKey>(key: K): Promise<unknown> {
    return (await this.all())[key]
  }

  /**
   * Write one setting, upserted on the key, so a caller never has to ask
   * whether this install has set it before.
   *
   * Throws on an unknown key and on a wrong shape; the route turns both into
   * a 400.
   */
  async set(key: string, value: unknown, by: string): Promise<void> {
    if (!isSettingKey(key)) throw new Error(`No install preference "${key}".`)
    const parsed = SETTINGS[key].schema.safeParse(value)
    if (!parsed.success) throw new Error(`"${key}" does not take that value.`)

    await this.db
      .insert(installPreferences)
      .values({ key, value: parsed.data, updatedBy: by })
      .onConflictDoUpdate({
        target: installPreferences.key,
        set: { value: parsed.data, updatedBy: by, updatedAt: new Date() },
      })
  }

  /** Forget a setting, so it answers its default again. */
  async clear(key: SettingKey): Promise<void> {
    await this.db.delete(installPreferences).where(eq(installPreferences.key, key))
  }
}
