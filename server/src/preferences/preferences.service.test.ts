/**
 * One analyst's own choices, attacked at the thing that makes them personal.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { PreferencesService } from './preferences.service.js'
import { cases, preferences, user } from '../db/schema/index.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

/**
 * The handle fixtures arrange rows through.
 */
const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

const SAM = 'prefs-sam'
const ALEX = 'prefs-alex'

describe.skipIf(!db)("an analyst's preferences", () => {
  let service: PreferencesService

  beforeEach(async () => {
    const now = new Date()
    for (const id of [SAM, ALEX]) {
      await seed!
        .insert(user)
        .values({
          id,
          name: id,
          email: `${id}@example.test`,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
    }
    await seed!.delete(preferences)
    await seed!.delete(cases)
    service = new PreferencesService(db!)
  })

  afterAll(async () => {
    await seed!.delete(preferences)
    await pool!.end()
  })

  /**
   * **No row is not an error, and it is not the same as choosing the defaults.**
   */
  it('reads as the defaults for an analyst who has chosen nothing', async () => {
    expect(await service.read(SAM)).toEqual({ theme: 'system', clock: 'local' })
    expect(await seed!.select().from(preferences).where(eq(preferences.userId, SAM))).toHaveLength(0)
  })

  it('keeps what was written', async () => {
    await service.write(SAM, { theme: 'dark', clock: 'utc' })
    expect(await service.read(SAM)).toMatchObject({ theme: 'dark', clock: 'utc' })
  })

  /** The whole point of the table: two analysts, two answers. */
  it('does not let one analyst read or move another', async () => {
    await service.write(SAM, { theme: 'dark' })

    expect(await service.read(ALEX)).toMatchObject({ theme: 'system' })
    await service.write(ALEX, { theme: 'light' })
    expect(await service.read(SAM)).toMatchObject({ theme: 'dark' })
  })

  /**
   * **A patch of one field leaves the others alone.**
   */
  it('changes only the field it was given', async () => {
    await service.write(SAM, { theme: 'dark', clock: 'utc' })
    await service.write(SAM, { clock: 'local' })

    expect(await service.read(SAM)).toMatchObject({ theme: 'dark', clock: 'local' })
  })

  it('upper-cases initials and refuses more than two characters', async () => {
    expect(await service.write(SAM, { initials: 'ab' })).toMatchObject({ initials: 'AB' })
    await expect(service.write(SAM, { initials: 'abc' })).rejects.toMatchObject({
      response: { message: expect.stringContaining('two characters') },
    })
  })

  /** Clearing goes back to derived, which is what absent means to the roster. */
  it('clears initials back to derived on an empty string', async () => {
    await service.write(SAM, { initials: 'AB' })
    expect(await service.write(SAM, { initials: '' })).not.toHaveProperty('initials')
  })

  /**
   * **Retired with the columns, not re-pointed.**
   */

  describe('the avatar', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

    it('is absent until one is set', async () => {
      expect(await service.avatar(SAM)).toBeNull()
      expect(await service.read(SAM)).not.toHaveProperty('avatarVersion')
    })

    it('comes back as the bytes that went in', async () => {
      await service.setAvatar(SAM, png, 'image/png')
      const found = await service.avatar(SAM)
      expect(found!.bytes.equals(png)).toBe(true)
      expect(found!.type).toBe('image/png')
    })

    it('bumps the version on every write, including a replacement', async () => {
      const first = await service.setAvatar(SAM, png, 'image/png')
      const second = await service.setAvatar(SAM, Buffer.from([0x89, 0x50]), 'image/png')

      expect(second.avatarVersion).toBeGreaterThan(first.avatarVersion)
    })

    it('bumps the version when it is cleared, so a held URL stops resolving', async () => {
      const set = await service.setAvatar(SAM, png, 'image/png')
      const cleared = await service.clearAvatar(SAM)

      expect(cleared.avatarVersion).toBeGreaterThan(set.avatarVersion)
      expect(await service.avatar(SAM)).toBeNull()
    })

    /** An image is one analyst's, like everything else here. */
    it('is not visible on another analyst', async () => {
      await service.setAvatar(SAM, png, 'image/png')
      expect(await service.avatar(ALEX)).toBeNull()
    })

    /** Setting an image must not disturb what they chose. */
    it('leaves the theme alone', async () => {
      await service.write(SAM, { theme: 'dark' })
      await service.setAvatar(SAM, png, 'image/png')

      expect(await service.read(SAM)).toMatchObject({ theme: 'dark' })
    })
  })

  /**
   * The one read here that crosses between analysts, and the only one that can
   * leak.
   */
  describe('the roster every disc is drawn from', () => {
    it('carries what another analyst chose', async () => {
      await service.write(ALEX, { tone: 4, initials: 'ax' })

      expect(await service.roster()).toContainEqual({
        userId: ALEX,
        tone: 4,
        initials: 'AX',
      })
    })

    /**
     * **The attack the shape invites.**
     */
    it('carries neither the theme nor the clock', async () => {
      await service.write(ALEX, { theme: 'dark', clock: 'utc', tone: 1 })

      const [row] = await service.roster()
      expect(row).not.toHaveProperty('theme')
      expect(row).not.toHaveProperty('clock')
    })

    /**
     * **Absent, not a row of defaults.**
     */
    it('omits an analyst who has chosen nothing', async () => {
      await service.write(ALEX, { tone: 2 })

      expect((await service.roster()).map((row) => row.userId)).toEqual([ALEX])
    })

    /** Same rule as `view`: absent means no image, rather than the number 0. */
    it('reports no version for an analyst with no image', async () => {
      await service.write(ALEX, { tone: 2 })

      expect(await service.roster()).toEqual([{ userId: ALEX, tone: 2 }])
    })

    it('reports the version for one who has an image', async () => {
      await service.setAvatar(ALEX, Buffer.from([0x89, 0x50]), 'image/png')

      expect(await service.roster()).toContainEqual(
        expect.objectContaining({ userId: ALEX, avatarVersion: 1 }),
      )
    })
  })
})
