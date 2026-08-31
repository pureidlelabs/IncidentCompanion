/**
 * The install's own preferences - everything one analyst changes *for
 * everybody*.
 *
 * `SETTINGS` is the closed vocabulary, validated both ways: an unknown key is
 * refused on write, and a value that no longer parses is read as its default
 * rather than handed on. These rows outlive the code that wrote them.
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
 *
 * **Compliance is on and every regime with it.** An install that surfaced no
 * regime by default would hide the whole compliance surface from an analyst who
 * never opened Settings - and the regimes are the reason this app exists in a
 * regulated environment. Turning one *off* is the deliberate act.
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
   *
   * Validated as an enum, so `atLeastBand` never sees a band it cannot find:
   * an unknown one indexes at -1 and reports the case clear.
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
   *
   * **Floored at `RETENTION_FLOOR_DAYS` here and again in the table's own
   * delete policy.** Two checks, because this setting is reachable from
   * anywhere the app can open a transaction and only one of them is in the
   * database - and because a refusal with a sentence beats a delete that
   * silently matches nothing.
   *
   * **A year by default, and the default is "keep".** An install that has
   * never opened this should not be discarding evidence on a schedule nobody
   * chose. -> `install-activity/prune.service.ts`
   */
  'audit.retentionDays': {
    schema: z.number().int().min(RETENTION_FLOOR_DAYS),
    fallback: RETENTION_DEFAULT_DAYS,
  },

  /**
   * **The security policy, declared in `policy/` and spread in here.** Those
   * keys are read by the controls they bound, which live in `auth` - and
   * `preferences` already imports `auth`, so declaring them here would make
   * that a folder cycle. One declaration either way.
   */
  ...POLICY_SETTINGS,

  /**
   * The second window, for lines that are volume rather than evidence.
   *
   * **Its own floor, and a lower one.** A month by default: these answer a
   * question about this week, and on a working install they are most of the
   * table. What is *in* the class is decided per event rather than per
   * channel - the channel would shorten `case_deleted` and
   * `audit_retention_changed`. -> `install-activity/retention-class.ts`
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
   *
   * **One query rather than one per key.** There are four today and a screen
   * reads all of them; a per-key read would be four round trips for a body
   * measured in bytes.
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
