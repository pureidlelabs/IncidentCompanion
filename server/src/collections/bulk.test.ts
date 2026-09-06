/**
 * The bulk doors, attacked at the guarantees rather than the happy path.
 *
 * Three properties are worth the tests and each fails in a way a count check
 * would miss: a batch is **all or nothing**, a bulk patch touches **only the
 * case it names**, and a delete **refuses rather than orphaning** - Postgres
 * would happily null forty references, because the keys are `ON DELETE SET
 * NULL` on purpose.
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
 *
 * **`ic_seed`, because a fixture writes across cases and the app role may
 * not.** Row-level security refuses an unscoped write, so a fixture on the
 * app handle fails before the test it was arranging ever runs. The subject
 * under test keeps `db` - if it forgets to scope itself, it fails here.
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
 * `UserSession` also carries the session record - token, expiry, ip. Building
 * one here would be inventing a shape no test asserts anything about, so the
 * narrowing is stated once, in the open.
 */
const asSession = (session: Session) => session as unknown as Parameters<
  BulkDeleteController['remove']
>[2]

/**
 * A row as a selection names it: what it is and what it was read at.
 *
 * Taken off the row rather than passed in, so a test that means "current"
 * cannot accidentally assert a stale version and pass for the wrong reason.
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
   * **The property Python called "one undo step".** A CSV import that fails on
   * row 400 must leave nothing behind, or the analyst has 399 rows and no way
   * to tell which import they came from.
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
   * **The guarantee a bulk write is most likely to be missing.** `collections`
   * requires a batch to carry every guarantee a single write carries, and names
   * the version check among them; `state` requires a write to state the version it
   * was made against and be refused where that no longer matches.
   *
   * The sequence is the one that loses work: two analysts hold a case, one
   * edits a row, and the other -- whose screen still shows what they read --
   * includes it in a selection. Without this, the second write wins silently
   * and the first analyst learns nothing.
   *
   * **Refused is not missing.** A row in another case is `missing`, because
   * from inside this case it does not exist. A row that moved is `refused`,
   * because it exists and the caller is out of date, and an analyst told the
   * wrong one of those looks in the wrong place.
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
   * patch above cannot catch this.** `refuseDanglingReferences` is the only
   * control, so a `createMany` that does not run it accepts a `systemId` naming
   * another case's host through `/bulk` while the same write is refused one row
   * at a time.
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
   * **Which row, when it is not the first one.** The CSV import highlights the
   * offending preview row by parsing `row <n>: ` off the refusal, so a message
   * without it leaves the analyst a whole file to search by hand -- and the
   * one refusal most likely to fire on an import is this one, since a CSV
   * exported from another case carries that case's ids in every reference
   * column.
   *
   * 1-based, matching every other row-shaped refusal the client parses.
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
   * **Checked per row, not once for the selection.** Two indicators can differ
   * in the half the patch does not name, so one selection can be legal for one
   * row and illegal for the next -- the reason this is a loop where the
   * reference check is a single call.
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
   * **Two doors, one answer.** The single-row path hands the version to the
   * cross-field check so a row somebody else has moved is answered by the
   * version refusal rather than by a rule the caller cannot act on. A bulk
   * patch is the same act through the other door and owes the same answer.
   *
   * Without the version the merge reads current disk, and the caller is told
   * their indicator may not carry a scope -- true of a row they never sent,
   * and nothing to do with the write they made.
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
   * **Postgres would allow this and that is the point.** `ON DELETE SET NULL`
   * is right for a single delete - the malware found on a host is still
   * evidence - and silently wrong for a selection, where the analyst never
   * agreed to blank the links.
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
   * **A row nothing points at deletes cleanly**, which is the other half of
   * the refusal: the check must not become a reason nothing can be removed.
   * An action is the honest subject - no collection references one.
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
   * timeline.** `evidenceIds` is jsonb, so Postgres constrains nothing and no
   * foreign key exists to consult; the scan is hand-written, and it was
   * hand-written *for the timeline* - a second table carrying an id array is
   * exactly the case a timeline-shaped loop answers zero for.
   *
   * A zero is the dangerous answer here, not an error: the delete succeeds and
   * the impact row is left citing evidence that no longer exists, which is the
   * one thing this whole check is for.
   *
   * **Asserted as a delta, because the demo's evidence is already cited by its
   * timeline.** The refusal fires either way, so "it refused" proves nothing
   * about the table under test -- an absolute count passes on what the timeline
   * supplies alone.
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
   *
   * Every test above hands the controller an object directly, so neither the
   * middleware nor the pipe is in the path -- and each one names `systems`,
   * `actions` or `evidence`, the spellings a camelCase conversion cannot
   * damage. `network_indicators` and `cloud_apps` are the two that can, and a
   * body they are refused in leaves all of this green: the middleware rewrites
   * the key, the enum does not have it, and the analyst reads "Invalid key in
   * record".
   *
   * The shape carries the collection as a *value*, for the reason the report
   * pack does: a converter cannot tell a field name from data, so the only safe
   * answer is not to put data in a key.
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
