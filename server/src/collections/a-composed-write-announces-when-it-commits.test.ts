/**
 * **A write composed into a larger act announces once that act has committed,
 * and never when it has not.**
 *
 * `case-channel.service.ts` states the contract the other way round -- *the
 * write has already committed* -- and nothing held a caller to it. Composed
 * into somebody else's transaction, a write's own commit is a released
 * savepoint, so announcing there tells a subscriber to re-read a case a
 * rollback may be about to remove.
 *
 * The remedy the service carried was to announce nothing when composed, which
 * made the opposite failure: an act that committed told nobody, and every
 * screen already open on the case stayed as it was. -> #556
 *
 * **Driven against a real transaction**, because the claim is about when a
 * commit happens. A fake handle would assert the code's own idea of the
 * ordering rather than the database's.
 *
 * **What this does not cover:** the socket, which `live.gateway.ts` owns, and
 * whether a subscriber acts on what it is told.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { beforeEach, describe, expect, it } from 'vitest'

import { CollectionService } from './collection.service.js'
import { ordered } from './entities.controller.js'
import { TABLES } from './registry.js'
import { cases, user } from '../db/schema/index.js'
import { asOneAct } from '../db/act.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env['DATABASE_URL'] ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

/** The handle a fixture arranges a case through: an unscoped write. */
const seedPool = process.env['SEED_DATABASE_URL']
  ? openTestPool(process.env['SEED_DATABASE_URL'], 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

const ANALYST = 'composed-analyst'

/** The real definition the controller writes through, not a hand-built one. */
const DEFINITION = () => ordered('systems', TABLES['systems'])

/** Every announcement the channel was asked to make, in order. */
function recorder() {
  const told: { caseId: string; scopes: readonly string[] }[] = []
  return {
    told,
    announce: (caseId: string, scopes: readonly string[]) => told.push({ caseId, scopes }),
  }
}

describe.skipIf(!db)('a write composed into a larger act', () => {
  let caseId: string

  beforeEach(async () => {
    const now = new Date()
    await seed!
      .insert(user)
      .values({
        id: ANALYST,
        name: 'Composed Analyst',
        email: 'composed@example.test',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
    const [row] = await seed!.insert(cases).values({ title: 'Composed' }).returning()
    caseId = row!.id
  })

  it('announces once the act it was composed into has committed', async () => {
    const channel = recorder()
    const collections = new CollectionService(db!, channel as never)

    await asOneAct(db!, async (tx) => {
      await collections.createMany(
        DEFINITION(),
        caseId,
        [{ hostname: 'COMPOSED-1' }],
        ANALYST,
        'refuse',
        tx,
      )
      expect(
        channel.told,
        'the announcement went out before the act committed, so a subscriber is told to ' +
          'read a row a rollback could still remove',
      ).toEqual([])
    })

    expect(
      channel.told.map((one) => one.scopes),
      'the act committed and nobody was told, so every screen open on this case stays stale',
    ).toEqual([['systems']])
  })

  it('announces nothing when the act it was composed into rolls back', async () => {
    const channel = recorder()
    const collections = new CollectionService(db!, channel as never)

    await expect(
      asOneAct(db!, async (tx) => {
        await collections.createMany(
          DEFINITION(),
          caseId,
          [{ hostname: 'COMPOSED-2' }],
          ANALYST,
          'refuse',
          tx,
        )
        throw new Error('the act failed after the write')
      }),
    ).rejects.toThrow('the act failed after the write')

    expect(
      channel.told,
      'a rolled-back act announced a row that is not in the case',
    ).toEqual([])
  })

  it('announces immediately when it opened its own transaction', async () => {
    const channel = recorder()
    const collections = new CollectionService(db!, channel as never)

    await collections.createMany(
      DEFINITION(),
      caseId,
      [{ hostname: 'ALONE-1' }],
      ANALYST,
      'refuse',
    )

    expect(
      channel.told.map((one) => one.scopes),
      'an uncomposed write stopped announcing, which is the ordinary path',
    ).toEqual([['systems']])
  })

  /**
   * **Composing without declaring an act is refused, not silently wrong.**
   * A caller that opens its own `db.transaction` and hands the handle down has
   * nowhere for the announcement to wait, and the two ways to carry on are the
   * two failures this is all about: announce now, before the commit, or drop it.
   */
  it('refuses a write composed into a transaction no act opened', async () => {
    const channel = recorder()
    const collections = new CollectionService(db!, channel as never)

    await expect(
      db!.transaction(async (tx) => {
        await collections.createMany(
          DEFINITION(),
          caseId,
          [{ hostname: 'UNDECLARED-1' }],
          ANALYST,
          'refuse',
          tx,
        )
      }),
      'a transaction nothing declared as an act took a composed write without complaint',
    ).rejects.toThrow(/asOneAct/)

    expect(channel.told, 'the refused act announced anyway').toEqual([])
  })
})
