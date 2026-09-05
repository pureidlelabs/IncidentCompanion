/**
 * The install's own preferences, and the two ways a key/value store goes wrong.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { InstallPreferencesService, SETTINGS, isSettingKey } from './install.service.js'
import { installPreferences } from '../db/schema/preferences.js'
import { DEFAULT_POLICY } from '../domain/compliance-policy.js'
import { openTestPool } from '../../test/database.js'

describe('the vocabulary', () => {
  it('knows its own keys and nothing else', () => {
    expect(isSettingKey('compliance.enabled')).toBe(true)
    expect(isSettingKey('compliance.regime.gdpr')).toBe(true)
    expect(isSettingKey('anything.else')).toBe(false)
  })

  it('surfaces compliance and every regime on a fresh install', () => {
    // An install that surfaced no regime by default hides the whole compliance
    // surface from an analyst who never opened Settings. Turning one off is
    // the deliberate act.
    //
    // **Every *switch*, not every setting.** This read `Object.keys(SETTINGS)`
    // and asserted `true` throughout, which held only while every setting was a
    // boolean - the GDPR policy floors are bands, and the assertion it was
    // making about them was that 'medium' is `true`.
    const switches = (Object.keys(SETTINGS) as (keyof typeof SETTINGS)[]).filter(
      (key) => typeof SETTINGS[key].fallback === 'boolean',
    )
    expect(switches.length).toBeGreaterThanOrEqual(4)
    for (const key of switches) {
      expect(SETTINGS[key].fallback, `${key} is off by default`).toBe(true)
    }
  })

  it('starts the GDPR obligations at the bands the lens defaults to', () => {
    // The floors are stored *and* have a default on the Policy the lens takes,
    // and the two are read in different places - a stored floor that drifted
    // from the lens's own default would change every verdict on an install
    // nobody had configured, with nothing on screen saying so.
    expect(SETTINGS['compliance.gdpr.authorityFloor'].fallback).toBe(
      DEFAULT_POLICY.authorityFloor,
    )
    expect(SETTINGS['compliance.gdpr.subjectsFloor'].fallback).toBe(DEFAULT_POLICY.subjectsFloor)
  })

  it('refuses a band outside the four ENISA publishes', () => {
    // It reaches `atLeastBand`, which indexes the band list: an unknown one
    // lands at -1 and compares as below every floor, so the case is reported
    // clear of both obligations rather than failing.
    expect(SETTINGS['compliance.gdpr.subjectsFloor'].schema.safeParse('catastrophic').success).toBe(
      false,
    )
    expect(SETTINGS['compliance.gdpr.subjectsFloor'].schema.safeParse('high').success).toBe(true)
  })
})

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

describe.skipIf(!db)('reading and writing one', () => {
  const settings = () => new InstallPreferencesService(db!)

  beforeEach(async () => {
    await db!.delete(installPreferences)
  })

  afterAll(async () => {
    await db!.delete(installPreferences)
    await pool!.end()
  })

  it('answers the default when nothing has ever been set', async () => {
    expect(await settings().get('compliance.regime.nis2')).toBe(true)
  })

  it('answers what was written', async () => {
    await settings().set('compliance.regime.nis2', false, 'u-analyst')
    expect(await settings().get('compliance.regime.nis2')).toBe(false)
  })

  it('takes the second write rather than colliding on the key', async () => {
    // Two analysts changing the same switch must not turn into a duplicate-key
    // error that one of them reads as a failure to save.
    await settings().set('compliance.enabled', false, 'u-one')
    await settings().set('compliance.enabled', true, 'u-two')
    expect(await settings().get('compliance.enabled')).toBe(true)
  })

  it('refuses a key it does not know', async () => {
    await expect(settings().set('compliance.regime.hipaa', true, 'u-analyst')).rejects.toThrow(
      /No install preference/,
    )
  })

  it('refuses a known key given the wrong shape', async () => {
    await expect(settings().set('compliance.enabled', 'yes', 'u-analyst')).rejects.toThrow(
      /does not take that value/,
    )
  })

  it('reads a value it can no longer parse as the default', async () => {
    // **The case with no other guard.** A row written by an older version - or
    // by hand - must not unmount the screen that reads it. Written straight to
    // the table, because the service is what would have refused it.
    await db!.insert(installPreferences).values({
      key: 'compliance.enabled',
      value: { was: 'an object once' },
    })
    expect(await settings().get('compliance.enabled')).toBe(true)
  })

  it('forgets one, so it answers its default again', async () => {
    await settings().set('compliance.enabled', false, 'u-analyst')
    await settings().clear('compliance.enabled')
    expect(await settings().get('compliance.enabled')).toBe(true)
  })
})
