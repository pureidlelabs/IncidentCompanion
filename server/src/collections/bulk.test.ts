/**
 * The bulk doors, attacked at the guarantees rather than the happy path.
 */
import { PATH_METADATA } from '@nestjs/common/constants'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { BulkDeleteController, bulkDeleteBodySchema } from './bulk-delete.controller.js'
import { CollectionService } from './collection.service.js'
import { ENTITY_CONTROLLERS } from './entities.controller.js'
import { DemoContentSeeder } from '../demos/content.seeder.js'
import { DemoSeederService } from '../demos/seeder.service.js'
import {
  actions,
  cases,
  evidence,
  impact,
  networkIndicators,
  systems,
  timeline,
  user,
} from '../db/schema/index.js'
import { openTestPool } from '../../test/database.js'
import { camelKeys } from '../wire/naming.js'

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

// **One teardown for the file, not one per `describe`.** A per-suite
// `pool.end()` closes the pool the *next* suite is still holding, and every
// test in it fails with "Cannot use a pool after calling end" -- which reads
// as a broken feature rather than as a broken fixture.
afterAll(async () => {
  if (db) await db.delete(cases)
  await pool?.end()
})

interface Bulk {
  createMany(caseId: string, body: unknown, session: Session): Promise<{ ids: string[] }>
  updateMany(
    caseId: string,
    body: unknown,
    session: Session,
  ): Promise<{ updated: string[]; missing: string[]; refused: string[] }>
  list(caseId: string): Promise<Record<string, unknown>[]>
}
interface Session {
  user: { id: string }
}

/**
 * **The handlers read `session.user.id` and nothing else**, but Better Auth's
 * `UserSession` also carries the session record - token, expiry, ip.
 */
const asSession = (session: Session) => session as unknown as Parameters<
  BulkDeleteController['remove']
>[2]

/**
 * A row as a selection names it: what it is and what it was read at.
 */
const selection = (row: Record<string, unknown>) => ({
  id: row['id'] as string,
  version: row['version'] as number,
})

function controllerFor(name: string): Bulk {
  const found = ENTITY_CONTROLLERS.find(
    (c) => Reflect.getMetadata(PATH_METADATA, c) === `api/cases/:caseId/${name}`,
  )!
  return new (found as new (s: CollectionService) => Bulk)(new CollectionService(db!))
}

describe.skipIf(!db)('writing many at once', () => {
  let caseId: string
  let otherCaseId: string
  let session: Session

  beforeAll(async () => {
    const actorId = 'bulk-analyst'
    const now = new Date()
    await seed!
      .insert(user)
      .values({
        id: actorId,
        name: 'Bulk Analyst',
        email: 'bulk@example.test',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
    session = { user: { id: actorId } }
  })

  beforeEach(async () => {
    await seed!.delete(cases)
    await new DemoSeederService(seed!, seed, new DemoContentSeeder(seed)).reseed()
    const [one] = await seed!.select().from(cases).where(eq(cases.reference, 'DEMO-2026-001'))
    const [two] = await seed!.select().from(cases).where(eq(cases.reference, 'DEMO-2026-014'))
    caseId = one!.id
    otherCaseId = two!.id
  })

  it('creates every row in one call', async () => {
    const { ids } = await controllerFor('systems').createMany(
      caseId,
      { entries: [{ hostname: 'BULK-01' }, { hostname: 'BULK-02' }, { hostname: 'BULK-03' }] },
      session,
    )
    expect(ids).toHaveLength(3)
    expect(await controllerFor('systems').list(caseId)).toHaveLength(6)
  })

  /**
   * **The property Python called "one undo step".**
   */
  it('writes nothing at all when one row in the batch is invalid', async () => {
    const before = (await controllerFor('systems').list(caseId)).length

    await expect(
      controllerFor('systems').createMany(
        caseId,
        { entries: [{ hostname: 'GOOD-01' }, { hostname: '' }, { hostname: 'GOOD-02' }] },
        session,
      ),
    ).rejects.toMatchObject({ response: { message: 'Validation failed' } })

    expect(await controllerFor('systems').list(caseId)).toHaveLength(before)
  })

  it('refuses a batch row that sets a field the schema does not have', async () => {
    await expect(
      controllerFor('systems').createMany(
        caseId,
        { entries: [{ hostname: 'X', createdBy: 'someone-else' }] },
        session,
      ),
    ).rejects.toMatchObject({ response: { message: 'Validation failed' } })
  })

  it('patches every named row and reports the ones it did not find', async () => {
    const rows = await controllerFor('systems').list(caseId)
    const named = rows.slice(0, 2).map(selection)
    const ghost = { id: '00000000-0000-4000-8000-000000000000', version: 1 }

    const result = await controllerFor('systems').updateMany(
      caseId,
      { ids: [...named, ghost], fields: { analyst: 'Bulk Analyst' } },
      session,
    )

    expect(result.updated.sort()).toEqual(named.map((one) => one.id).sort())
    expect(result.missing).toEqual([ghost.id])
    expect(result.refused).toEqual([])
  })

  /**
   * **The guarantee a bulk write is most likely to be missing.**
   */
  it('refuses a row whose version moved, and leaves it as it was', async () => {
    const rows = await controllerFor('systems').list(caseId)
    const stale = rows[0]!
    const fresh = rows[1]!

    // Somebody else writes first, so the version the selection carries is old.
    await seed!
      .update(systems)
      .set({ analyst: 'the first writer', version: (stale['version'] as number) + 1 })
      .where(eq(systems.id, stale['id'] as string))

    const result = await controllerFor('systems').updateMany(
      caseId,
      {
        ids: [
          { id: stale['id'] as string, version: stale['version'] as number },
          { id: fresh['id'] as string, version: fresh['version'] as number },
        ],
        fields: { analyst: 'the second writer' },
      },
      session,
    )

    expect(result.refused).toEqual([stale['id']])
    expect(result.updated).toEqual([fresh['id']])

    const [after] = await seed!.select().from(systems).where(eq(systems.id, stale['id'] as string))
    expect(after!.analyst, 'the first writer must not be overwritten').toBe('the first writer')
  })

  /**
   * **Every row's outcome is determinable**, which is the half of the
   * requirement a count cannot satisfy: told three of five landed, an analyst
   * still does not know which two to look at.
   */
  it('accounts for every row it was given', async () => {
    const rows = await controllerFor('systems').list(caseId)
    const stale = rows[0]!
    const fresh = rows[1]!
    const ghost = '00000000-0000-4000-8000-000000000000'

    await seed!
      .update(systems)
      .set({ version: (stale['version'] as number) + 1 })
      .where(eq(systems.id, stale['id'] as string))

    const result = await controllerFor('systems').updateMany(
      caseId,
      {
        ids: [
          { id: stale['id'] as string, version: stale['version'] as number },
          { id: fresh['id'] as string, version: fresh['version'] as number },
          { id: ghost, version: 1 },
        ],
        fields: { analyst: 'accounted for' },
      },
      session,
    )

    const answered = [...result.updated, ...result.missing, ...result.refused].sort()
    expect(answered, 'a row named in the selection and in no answer is unaccounted for').toEqual(
      [stale['id'] as string, fresh['id'] as string, ghost].sort(),
    )
  })

  /**
   * A bulk patch carries the case scope as well as the version check, so a
   * selection cannot reach another customer's rows however current it is.
   */
  it('will not reach a row in another case', async () => {
    const [victim] = await seed!.select().from(systems).where(eq(systems.caseId, otherCaseId))

    const result = await controllerFor('systems').updateMany(
      caseId,
      { ids: [{ id: victim!.id, version: victim!.version }], fields: { analyst: 'trespass' } },
      session,
    )

    expect(result.updated).toEqual([])
    expect(result.missing).toEqual([victim!.id])
    const [after] = await seed!.select().from(systems).where(eq(systems.id, victim!.id))
    expect(after!.analyst).not.toBe('trespass')
  })

  /**
   * **A reference is outside row-level security, so the scope that catches the
   * patch above cannot catch this.**
   *
   * Asserted on `impact`, whose `systemId` carries `refTarget: 'systems'`.
   */
  it('refuses a bulk create whose reference names a row in another case', async () => {
    const [theirs] = await seed!.select().from(systems).where(eq(systems.caseId, otherCaseId))
    const before = (await controllerFor('impact').list(caseId)).length

    await expect(
      controllerFor('impact').createMany(
        caseId,
        { entries: [{ label: 'Trespass', systemId: theirs!.id }] },
        session,
      ),
    // `row 1:` because a batch names the row it refused; the single-write
    // paths carry the bare sentence, having no row to name.
    ).rejects.toMatchObject({
      response: { message: 'row 1: No such row in this case: systemId.' },
    })

    expect(await controllerFor('impact').list(caseId)).toHaveLength(before)
  })

  /**
   * **Which row, when it is not the first one.**
   */
  it('names the row whose reference is refused', async () => {
    const [theirs] = await seed!.select().from(systems).where(eq(systems.caseId, otherCaseId))
    const [ours] = await seed!.select().from(systems).where(eq(systems.caseId, caseId))

    await expect(
      controllerFor('impact').createMany(
        caseId,
        {
          entries: [
            { label: 'Fine', systemId: ours!.id },
            { label: 'Fine too', systemId: ours!.id },
            { label: 'The bad one', systemId: theirs!.id },
          ],
        },
        session,
      ),
    ).rejects.toMatchObject({
      response: { message: 'row 3: No such row in this case: systemId.' },
    })
  })

  it('refuses a bulk patch whose reference names a row in another case', async () => {
    const [theirs] = await seed!.select().from(systems).where(eq(systems.caseId, otherCaseId))
    const mine = (await controllerFor('impact').list(caseId))[0]!

    await expect(
      controllerFor('impact').updateMany(
        caseId,
        { ids: [selection(mine)], fields: { systemId: theirs!.id } },
        session,
      ),
    ).rejects.toMatchObject({ response: { message: 'No such row in this case: systemId.' } })

    const [after] = await seed!.select().from(impact).where(eq(impact.id, mine['id'] as string))
    expect(after!.systemId).not.toBe(theirs!.id)
  })

  /**
   * **Checked per row, not once for the selection.**
   */
  it('refuses a bulk patch that would leave any one row breaking a cross-field rule', async () => {
    const safe = await controllerFor('network_indicators').createMany(
      caseId,
      { entries: [{ type: 'ipv4', value: '198.51.100.20' }] },
      session,
    )
    const doomed = await controllerFor('network_indicators').createMany(
      caseId,
      { entries: [{ type: 'ipv4', value: '198.51.100.21', scope: 'branch-a' }] },
      session,
    )

    const written = await controllerFor('network_indicators').list(caseId)
    const named = [...safe.ids, ...doomed.ids].map((id) =>
      selection(written.find((row) => row['id'] === id)!),
    )

    await expect(
      controllerFor('network_indicators').updateMany(
        caseId,
        { ids: named, fields: { type: 'domain' } },
        session,
      ),
    ).rejects.toMatchObject({ response: { message: /Only an address has a scope/ } })

    // All or nothing: the row that would have been legal is untouched too.
    const rows = await controllerFor('network_indicators').list(caseId)
    const kept = rows.find((row) => row['id'] === safe.ids[0])
    expect(kept?.['value']).toBe('198.51.100.20')
    expect(kept?.['type']).toBe('ipv4')
  })

  /**
   * **Two doors, one answer.**
   */
  it('answers a moved row with the version, not the rule it would have broken', async () => {
    const made = await controllerFor('network_indicators').createMany(
      caseId,
      { entries: [{ type: 'ipv4', value: '198.51.100.60' }] },
      session,
    )
    const before = (await controllerFor('network_indicators').list(caseId)).find(
      (row) => row['id'] === made.ids[0],
    )!

    // Somebody else scopes the row, which is legal on an address. The
    // selection this caller holds still shows the row as it was.
    await seed!
      .update(networkIndicators)
      .set({ scope: 'branch-a', version: (before['version'] as number) + 1 })
      .where(eq(networkIndicators.id, before['id'] as string))

    const result = await controllerFor('network_indicators').updateMany(
      caseId,
      {
        ids: [{ id: before['id'] as string, version: before['version'] as number }],
        fields: { type: 'domain' },
      },
      session,
    )

    expect(result.refused).toEqual([before['id']])
    expect(result.updated).toEqual([])

    const [after] = await seed!
      .select()
      .from(networkIndicators)
      .where(eq(networkIndicators.id, before['id'] as string))
    expect(after!.type, 'the refused row must be as the other analyst left it').toBe('ipv4')
    expect(after!.scope).toBe('branch-a')
  })

  /**
   * The bulk half of the single-row case in `entities.write.test.ts`: the
   * stored row is read per id here too, so a `Date` column reaches the merge
   * parse the same way and refuses a patch that never touched the time.
   */
  it('allows a bulk patch to rows whose timestamp column is set', async () => {
    const made = await controllerFor('network_indicators').createMany(
      caseId,
      {
        entries: [
          { type: 'ipv4', value: '198.51.100.40', blocked: true,
            blockedAt: '2026-08-16T10:00:00.000Z' },
          { type: 'ipv4', value: '198.51.100.41', blocked: true,
            blockedAt: '2026-08-16T11:00:00.000Z' },
        ],
      },
      session,
    )

    const written = await controllerFor('network_indicators').list(caseId)
    const result = await controllerFor('network_indicators').updateMany(
      caseId,
      {
        ids: made.ids.map((id) => selection(written.find((row) => row['id'] === id)!)),
        fields: { context: 'bulk edit' },
      },
      session,
    )

    expect(result.updated.sort()).toEqual([...made.ids].sort())
  })

  it('leaves the fields a bulk patch does not name alone', async () => {
    const rows = await controllerFor('systems').list(caseId)
    const target = rows[0]!
    await controllerFor('systems').updateMany(
      caseId,
      { ids: [selection(target)], fields: { analyst: 'Only This' } },
      session,
    )

    const [after] = await seed!.select().from(systems).where(eq(systems.id, target['id'] as string))
    expect(after!.analyst).toBe('Only This')
    expect(after!.hostname).toBe(target['hostname'])
    expect(after!.verdict).toBe(target['verdict'])
  })
})

describe.skipIf(!db)('deleting a selection that spans collections', () => {
  let caseId: string
  let session: Session
  const controller = () => new BulkDeleteController(new CollectionService(db!))

  beforeEach(async () => {
    await seed!.delete(cases)
    await new DemoSeederService(seed!, seed, new DemoContentSeeder(seed)).reseed()
    const [one] = await seed!.select().from(cases).where(eq(cases.reference, 'DEMO-2026-001'))
    caseId = one!.id
    session = { user: { id: 'bulk-analyst' } }
  })

  /**
   * **Postgres would allow this and that is the point.**
   */
  it('refuses a host the timeline still names, and says how many', async () => {
    const [host] = await seed!
      .select()
      .from(systems)
      .where(eq(systems.caseId, caseId))

    await expect(
      controller().remove(caseId, { targets: [{ collection: 'systems', ids: [host!.id] }] }, asSession(session)),
    ).rejects.toMatchObject({ response: { message: 'Some of those are still referenced.' } })

    const [survivor] = await seed!.select().from(systems).where(eq(systems.id, host!.id))
    expect(survivor).toBeDefined()
  })

  /**
   * **A row nothing points at deletes cleanly**, which is the other half of the
   * refusal: the check must not become a reason nothing can be removed.
   */
  it('deletes a row nothing references', async () => {
    const [task] = await seed!.select().from(actions).where(eq(actions.caseId, caseId))

    const result = await controller().remove(
      caseId,
      { targets: [{ collection: 'actions', ids: [task!.id] }] },
      asSession(session),
    )

    expect(result.deleted).toEqual([{ collection: 'actions', id: task!.id }])
    const [gone] = await seed!.select().from(actions).where(eq(actions.id, task!.id))
    expect(gone).toBeUndefined()
  })

  /**
   * The count is per id rather than a total, because a selection spanning
   * tables cannot be corrected from one number - which of forty rows is the
   * analyst meant to deselect?
   */
  it('counts the holders per id, not as a total', async () => {
    const [host] = await seed!.select().from(systems).where(eq(systems.caseId, caseId))
    const naming = await seed!.select().from(timeline).where(eq(timeline.caseId, caseId))
    const expected = naming.filter((row) => row.systemId === host!.id).length

    const refused = await controller()
      .remove(caseId, { targets: [{ collection: 'systems', ids: [host!.id] }] }, asSession(session))
      .then(() => null)
      .catch((error: unknown) => (error as { response: { references: Record<string, number> } }).response)

    expect(refused).not.toBeNull()
    expect(refused!.references[host!.id]).toBeGreaterThanOrEqual(expected)
  })

  /**
   * **The array half of the reference check, on a table that is not the
   * timeline.**
   */
  it('counts an impact row among the holders of the evidence it cites', async () => {
    const [artefact] = await seed!.select().from(evidence).where(eq(evidence.caseId, caseId))
    const held = async () =>
      controller()
        .remove(caseId, { targets: [{ collection: 'evidence', ids: [artefact!.id] }] }, asSession(session))
        .then(() => 0)
        .catch(
          (error: unknown) =>
            (error as { response: { references: Record<string, number> } }).response.references[
              artefact!.id
            ] ?? 0,
        )

    const before = await held()
    await seed!.insert(impact).values({
      caseId,
      label: 'Customer CRM export',
      disposition: 'exfiltrated',
      evidenceIds: [artefact!.id],
    })

    expect(await held()).toBe(before + 1)

    const [survivor] = await seed!.select().from(evidence).where(eq(evidence.id, artefact!.id))
    expect(survivor).toBeDefined()
  })

  it('reports an id it did not find rather than claiming it deleted it', async () => {
    const ghost = '00000000-0000-4000-8000-000000000000'
    const result = await controller().remove(
      caseId,
      { targets: [{ collection: 'actions', ids: [ghost] }] },
      asSession(session),
    )

    expect(result.deleted).toEqual([])
    expect(result.missing).toEqual([{ collection: 'actions', id: ghost }])
  })
})

describe('the selection as it arrives over HTTP', () => {
  /**
   * **Through `camelKeys`, because that is what the body meets first.**
   */
  it.each(['network_indicators', 'cloud_apps', 'systems', 'casenotes'])(
    'survives the wire for %s',
    (collection) => {
      const id = '11111111-1111-4111-8111-111111111111'
      const sent = camelKeys({ targets: [{ collection, ids: [id] }] })

      const parsed = bulkDeleteBodySchema.safeParse(sent)
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
      expect(parsed.data?.targets[0]?.collection).toBe(collection)
    },
  )
})
