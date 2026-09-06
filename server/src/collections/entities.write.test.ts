/**
 * The derived write path, attacked rather than demonstrated.
 *
 * **The question each case asks is "how do I make this write something it must
 * not".** A create route whose body shape is inferred from the schema is only
 * safe if the schema is the whole gate - so these go at the fields that are
 * *not* in it (`version`, `caseId`, `createdBy`), at the version check, and at
 * the string/`Date` boundary that every timestamp column crosses.
 *
 * Driven through the controllers rather than the service, because the
 * derivation being tested lives in the controller: the service would happily
 * write anything it is handed.
 */
import { PATH_METADATA } from '@nestjs/common/constants'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CollectionService } from './collection.service.js'
import { ENTITY_CONTROLLERS } from './entities.controller.js'
import { DemoContentSeeder } from '../demos/content.seeder.js'
import { DemoSeederService } from '../demos/seeder.service.js'
import { cases, systems, user } from '../db/schema/index.js'
import { openTestPool } from '../../test/database.js'

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

interface Writable {
  list(caseId: string): Promise<Record<string, unknown>[]>
  create(caseId: string, body: unknown, session: { user: { id: string } }): Promise<unknown>
  update(
    caseId: string,
    id: string,
    body: unknown,
    session: { user: { id: string } },
  ): Promise<unknown>
  remove(
    caseId: string,
    id: string,
    version: string,
    session: { user: { id: string } },
  ): Promise<unknown>
}

function controllerFor(name: string): Writable {
  const found = ENTITY_CONTROLLERS.find(
    (c) => Reflect.getMetadata(PATH_METADATA, c) === `api/cases/:caseId/${name}`,
  )!
  return new (found as new (s: CollectionService) => Writable)(new CollectionService(db!))
}

describe.skipIf(!db)('writing an entity', () => {
  let caseId: string
  let session: { user: { id: string } }

  beforeAll(async () => {
    await seed!.delete(cases)
    await new DemoSeederService(seed!, seed, new DemoContentSeeder(seed)).reseed()
    const [row] = await seed!.select().from(cases).where(eq(cases.reference, 'DEMO-2026-001'))
    caseId = row!.id
    // **Attribution is a real foreign key**, so the actor has to exist - a
    // made-up id fails the insert rather than storing an unattributed row,
    // which is the property `createdBy` was given a reference for.
    const actorId = 'test-analyst'
    const now = new Date()
    await seed!
      .insert(user)
      .values({
        id: actorId,
        name: 'Test Analyst',
        email: 'test-analyst@example.test',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
    session = { user: { id: actorId } }
  })

  afterAll(async () => {
    await seed!.delete(cases)
    await pool!.end()
  })

  it('creates a row and attributes it to the caller', async () => {
    const created = (await controllerFor('systems').create(
      caseId,
      { hostname: 'WKS-NEW01', systemType: 'laptop' },
      session,
    )) as Record<string, unknown>

    expect(created['hostname']).toBe('WKS-NEW01')
    expect(created['createdBy']).toBe(session.user.id)
    expect(created['version']).toBe(1)
  })

  /**
   * **The whole point of deriving the DTO.** None of these fields is in the
   * domain schema, so `.strict()` refuses them without anything enumerating
   * what is forbidden -- and an enumeration is what goes stale.
   */
  it.each([
    ['version', { hostname: 'X', version: 99 }],
    ['caseId', { hostname: 'X', caseId: '00000000-0000-0000-0000-000000000000' }],
    ['createdBy', { hostname: 'X', createdBy: 'someone-else' }],
    ['id', { hostname: 'X', id: '00000000-0000-0000-0000-000000000000' }],
    ['source', { hostname: 'X', source: 'imported' }],
  ])('refuses a create that sets %s', async (_field, body) => {
    // **`.response`, not `.message`.** A Nest HttpException built from an
    // object keeps the payload there and leaves `message` as the generic
    // "Bad Request Exception" - so `toThrow(/Validation failed/)` passes on
    // nothing and fails on everything.
    await expect(
      controllerFor('systems').create(caseId, body, session),
    ).rejects.toMatchObject({ response: { message: 'Validation failed' } })
  })

  it('refuses a patch that sets a field the schema does not have', async () => {
    const [row] = await seed!.select().from(systems).where(eq(systems.caseId, caseId))
    await expect(
      controllerFor('systems').update(
        caseId,
        row!.id,
        { version: row!.version, createdBy: 'someone-else' },
        session,
      ),
    ).rejects.toMatchObject({ response: { message: 'Validation failed' } })
  })

  it('refuses a patch that names no version', async () => {
    const [row] = await seed!.select().from(systems).where(eq(systems.caseId, caseId))
    await expect(
      controllerFor('systems').update(caseId, row!.id, { hostname: 'X' }, session),
    ).rejects.toMatchObject({ response: { message: /version it read/ } })
  })

  /**
   * **A cross-field rule has to be checked against the row the write leaves
   * behind, not against the body.** `networkIndicatorSchema` says only an
   * address may carry a scope; a patch setting `type` carries no `scope` at
   * all, so the rule cannot be answered from the patch alone.
   *
   * The body here is *valid on its own* -- that is the whole difficulty, and
   * why a schema-level fix does not reach it.
   */
  it('refuses a patch that would leave a scope on something that is not an address', async () => {
    const created = (await controllerFor('network_indicators').create(
      caseId,
      { type: 'ipv4', value: '198.51.100.9', scope: 'branch-a' },
      session,
    )) as Record<string, unknown>

    await expect(
      controllerFor('network_indicators').update(
        caseId,
        created['id'] as string,
        { version: created['version'] as number, type: 'domain' },
        session,
      ),
    ).rejects.toMatchObject({ response: { message: /Only an address has a scope/ } })
  })

  /**
   * **The merged row comes out of Drizzle, not off the wire.** A `timestamp`
   * column arrives as a `Date`, and `blockedAt` is declared `z.iso.datetime()`
   * -- a string. Parsing the merge without converting refuses a patch that has
   * nothing to do with the time, and only on rows where the timestamp is set,
   * which is why the first two tests here did not catch it.
   */
  it('allows a patch to a row whose timestamp column is set', async () => {
    const created = (await controllerFor('network_indicators').create(
      caseId,
      { type: 'ipv4', value: '198.51.100.30', blocked: true,
        blockedAt: '2026-08-16T10:00:00.000Z' },
      session,
    )) as Record<string, unknown>

    const result = (await controllerFor('network_indicators').update(
      caseId,
      created['id'] as string,
      { version: created['version'] as number, context: 'still fine' },
      session,
    )) as Record<string, unknown>

    expect(result['context']).toBe('still fine')
  })

  /**
   * **A stale caller is owed the version's answer, not this rule's.** The
   * cross-field check reads current disk, so if another analyst has already
   * cleared the other half it would refuse the patch for breaking a rule the
   * caller's own base did not break -- and the analyst would go looking for a
   * value they can still see on screen.
   *
   * **Asserted as a 409 rather than as "not a 400".** The weaker form passes
   * for a 500 or a 404 too, so it could not tell the version check answering
   * from the request failing for some unrelated reason -- which is the one
   * distinction this case exists to make.
   */
  it('lets the version check answer a stale patch, rather than the cross-field rule', async () => {
    const created = (await controllerFor('network_indicators').create(
      caseId,
      { type: 'ipv4', value: '198.51.100.50', scope: 'branch-a' },
      session,
    )) as Record<string, unknown>
    const stale = created['version'] as number

    // Somebody else clears the scope, so on disk the indicator carries none.
    await controllerFor('network_indicators').update(
      caseId,
      created['id'] as string,
      { version: stale, scope: '' },
      session,
    )

    // The first analyst, still holding the version they read, changes the kind
    // to one that may not carry a scope.
    const refusal = await controllerFor('network_indicators')
      .update(caseId, created['id'] as string, { version: stale, type: 'domain' }, session)
      .then(() => null)
      .catch((error: { status?: number }) => error)

    expect(refusal).not.toBeNull()
    expect((refusal as { status?: number }).status).toBe(409)
  })

  it('allows a patch that clears the scope while the value stands', async () => {
    const created = (await controllerFor('network_indicators').create(
      caseId,
      { type: 'ipv4', value: '198.51.100.10', scope: 'branch-a' },
      session,
    )) as Record<string, unknown>

    const result = (await controllerFor('network_indicators').update(
      caseId,
      created['id'] as string,
      { version: created['version'] as number, scope: '' },
      session,
    )) as Record<string, unknown>

    expect(result['scope']).toBe('')
    expect(result['value']).toBe('198.51.100.10')
  })

  it('refuses a patch under a stale version, and says what the row reached', async () => {
    const [row] = await seed!.select().from(systems).where(eq(systems.caseId, caseId))
    const stale = row!.version

    await controllerFor('systems').update(caseId, row!.id, { version: stale, analyst: 'A' }, session)

    await expect(
      controllerFor('systems').update(caseId, row!.id, { version: stale, analyst: 'B' }, session),
    ).rejects.toMatchObject({
      response: { message: 'Someone else wrote this first.', currentVersion: stale + 1 },
    })
  })

  /**
   * **A patch changes what it names and nothing else**, which sounds like a
   * restatement of PATCH and is the property that broke.
   *
   * Zod's defaults fire on *absent* input and `.partial()` only makes a field
   * optional, so `partial().parse({ analyst: 'A' })` returned `analyst` plus
   * seven fields at their defaults - an UPDATE that reset the rest of the row.
   * It surfaced as a NOT NULL violation on one column, which is luck: without
   * that constraint it would have blanked an analyst's work in silence, and
   * the version check would have recorded the write as legitimate.
   *
   * Asserted field by field rather than through the version check, because the
   * version check going red was the *incidental* symptom.
   */
  it('leaves the fields a patch does not name alone', async () => {
    const before = (await controllerFor('systems').create(
      caseId,
      {
        hostname: 'WKS-KEEP01',
        systemType: 'server',
        verdict: 'compromised',
        zone: 'internal - server',
        tags: 'keep-me',
      },
      session,
    )) as Record<string, unknown>

    await controllerFor('systems').update(
      caseId,
      before['id'] as string,
      { version: before['version'], analyst: 'R. Okonkwo' },
      session,
    )

    const [after] = await seed!.select().from(systems).where(eq(systems.id, before['id'] as string))
    expect(after!.analyst).toBe('R. Okonkwo')
    expect(after!.systemType).toBe('server')
    expect(after!.verdict).toBe('compromised')
    expect(after!.zone).toBe('internal - server')
    expect(after!.tags).toBe('keep-me')
  })

  /**
   * **A timestamp arrives as a string and the column wants a `Date`.** The
   * conversion is derived from the table, so this also covers `firstSeen`,
   * which no `*At` rule would have matched.
   */
  it('stores an ISO string into a timestamp column', async () => {
    const when = '2026-08-01T09:30:00.000Z'
    const created = (await controllerFor('malware').create(
      caseId,
      { filename: 'probe.exe', firstSeen: when },
      session,
    )) as Record<string, unknown>

    expect(created['firstSeen']).toBeInstanceOf(Date)
    expect((created['firstSeen'] as Date).toISOString()).toBe(when)
  })

  it('deletes under a version and refuses under a stale one', async () => {
    const created = (await controllerFor('accounts').create(
      caseId,
      { accountName: 'temp@example.test' },
      session,
    )) as { id: string; version: number }

    await expect(
      controllerFor('accounts').remove(caseId, created.id, String(created.version + 5), session),
    ).rejects.toMatchObject({ response: { message: 'Someone else wrote this first.' } })

    expect(
      await controllerFor('accounts').remove(caseId, created.id, String(created.version), session),
    ).toEqual({ deleted: true })
  })

  /**
   * **A write is scoped to its case, and the guard is not what proves it.**
   * `CaseAccessGuard` checks the case exists; nothing there stops a patch
   * naming a row that belongs to a *different* case, so the `caseId` in the
   * `where` is the thing under test.
   */
  it('will not patch a row belonging to another case', async () => {
    const [other] = await seed!.select().from(cases).where(eq(cases.reference, 'DEMO-2026-014'))
    const [row] = await seed!.select().from(systems).where(eq(systems.caseId, caseId))

    const refusal = await controllerFor('systems')
      .update(other!.id, row!.id, { version: row!.version, analyst: 'trespass' }, session)
      .then(() => null)
      .catch((error: { status?: number }) => error)

    expect(refusal, 'a row was patched across a case boundary').not.toBeNull()
    expect((refusal as { status?: number }).status).toBe(404)

    /**
     * **The refusal is not the property. The row is.** A bare `toThrow` passes
     * on a write that already landed and then failed on the way out, which is
     * the shape a case-boundary defect actually takes.
     */
    const [after] = await seed!.select().from(systems).where(eq(systems.id, row!.id))
    expect(after!.analyst).toBe(row!.analyst)
    expect(after!.version).toBe(row!.version)
  })
})
