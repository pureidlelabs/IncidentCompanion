import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { reportLanguage } from '../db/schema/language.js'
import { EN_KEYS } from './document/packs.js'
import { LanguageService } from './language.service.js'
import { openTestPool } from '../../test/database.js'

/**
 * **Coverage is a fact about the pack and the application together**, so it is
 * measured when it is read rather than when the pack arrived.
 *
 * `coverageIn` divides what a pack carries by the keys the application prints.
 * Stored once, the divisor is frozen at whatever the app printed that day: a
 * pack uploaded at 100% still claims 100% after four keys are added, and the
 * note telling a reader the document is part English is gated on exactly that
 * number -- so the one case the note exists for is the one it is suppressed
 * in.
 *
 * The pack here carries half the keys. Nothing records a figure for it any
 * more -- the column that did is gone, because a stored derivation is what let
 * the two disagree -- so what these assert is that the number comes from the
 * strings every time it is asked for.
 *
 * **A sent report is unaffected and that is what makes this safe.** Its
 * rendered tree is frozen at send and painted from there, never re-resolved,
 * so the figure under a document nobody edited does not move. What moves is a
 * draft's, which is the number an analyst is deciding from.
 */
const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

describe.skipIf(!db)('a pack carrying half the keys', () => {
  let languages: LanguageService
  const code = `zz${String(Date.now()).slice(-4)}`
  const half = Math.floor(EN_KEYS.length / 2)

  beforeAll(async () => {
    const strings: Record<string, string> = {}
    for (const key of EN_KEYS.slice(0, half)) strings[key] = 'vertaald'

    await seed!.insert(reportLanguage).values({
      code,
      label: 'Half a pack',
      strings,
      builtin: false,
    })

    languages = new LanguageService(db!, seed)
  })

  afterAll(async () => {
    await seed?.delete(reportLanguage).where(eq(reportLanguage.code, code))
    await pool?.end()
    if (seedPool !== pool) await seedPool?.end()
  })

  it('is listed at what it actually carries', async () => {
    const listed = await languages.list()
    const mine = listed.find((one) => one.code === code)

    expect(mine, 'the pack was not listed at all').toBeDefined()
    expect(mine!.coverage).toBeLessThan(1)
    expect(mine!.coverage).toBeCloseTo(half / EN_KEYS.length, 5)
  })

  it('answers the renderer at what it actually carries', async () => {
    const measured = await languages.coverageOf(code)

    expect(measured, 'the note that says a report is part English reads this').toBeLessThan(1)
    expect(measured).toBeCloseTo(half / EN_KEYS.length, 5)
  })

  /**
   * The control: a pack really carrying every key still reads whole, so the
   * case above is measuring rather than refusing.
   */
  it('still reads whole where the pack carries every key', async () => {
    const whole = `${code}w`
    const strings: Record<string, string> = {}
    for (const key of EN_KEYS) strings[key] = 'vertaald'
    await seed!
      .insert(reportLanguage)
      .values({ code: whole, label: 'Whole', strings, builtin: false })

    expect(await languages.coverageOf(whole)).toBe(1)

    await seed!.delete(reportLanguage).where(eq(reportLanguage.code, whole))
  })
})
