/**
 * **An install restored without its artefacts says so at start.**
 *
 * *A copy of the database MUST name which artefacts it expects to find beside
 * it, so that a restore can say what is missing rather than discovering it
 * when somebody opens a case.* -> #179, `openspec/specs/state/design.md`
 *
 * **What this does not cover:** what a case does when it opens an artefact
 * that is not there, which is `report/render.service.ts`'s and is already
 * demonstrated; and that the artefacts put back afterwards make the evidence
 * whole, which is
 * `evidence/artefacts-put-back-make-the-evidence-whole.test.ts`.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { eq, inArray } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Logger } from '@nestjs/common'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ArtefactCensus, saysAtStart, type Census } from './artefact-census.service.js'
import { HealthModule } from './health.module.js'
import { EvidenceStore } from '../evidence/store.js'
import { cases, evidence, user } from '../db/schema/index.js'
import { hasConcurrentConnections, openTestPool } from '../../test/database.js'

/**
 * **The seed handle, because a fixture here writes across cases.** Row-level
 * security refuses an unscoped write on the app role, so a fixture on it fails
 * before the case it was arranging ever runs.
 */
const SEED = process.env['SEED_DATABASE_URL'] ?? process.env['DATABASE_URL'] ?? ''
const pool = SEED ? openTestPool(SEED, 'ic_seed') : null
const db = pool ? drizzle({ client: pool }) : null

/**
 * **The role the server actually runs as.** `ic_seed` reads across every case
 * by policy, so a census measured only on the seed handle certifies a query
 * that answers nothing on a real install -- and answering nothing is
 * indistinguishable from an install that holds every artefact it expects.
 *
 * **The whole file skips together rather than this one case alone.** It is the
 * only guard on that defect, so a run with `SEED_DATABASE_URL` set and
 * `DATABASE_URL` unset would drop it while the rest of the file reported a
 * clean pass -- the silent-partial-skip shape, on the case that matters most.
 */
const APP = process.env['DATABASE_URL'] ?? ''
const appPool = APP ? openTestPool(APP, 'ic_app') : null
const appDb = appPool ? drizzle({ client: appPool }) : null

const ANALYST = 'census-analyst'
const hashFor = (what: string) => what.padEnd(64, '0')

describe.skipIf(!db || !appDb || !hasConcurrentConnections())('what an install can find beside it', () => {
  let root = ''
  let caseId = ''
  // Every case and every directory made here, because `beforeEach` makes one
  // of each per test: this suite shares its database with every other file,
  // and removing only the last directory leaks one per case into `$TMPDIR` on
  // every run, CI included.
  const made: string[] = []
  const roots: string[] = []

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ic-census-'))
    roots.push(root)
    const now = new Date()
    await db!
      .insert(user)
      .values({
        id: ANALYST,
        name: 'Census Analyst',
        email: `${ANALYST}@example.test`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
    const [one] = await db!.insert(cases).values({ title: 'Restored' }).returning()
    caseId = one!.id
    made.push(caseId)
  })

  afterAll(async () => {
    for (const one of roots) await rm(one, { recursive: true, force: true })
    await db!.delete(cases).where(inArray(cases.id, made))
    await db!.delete(user).where(eq(user.id, ANALYST))
    await pool?.end()
    await appPool?.end()
  })

  /**
   * An artefact this install holds the bytes of.
   *
   * **`storedAt` is what says so, and it is the point of the fixture.** A row
   * carrying only a digest is evidence held somewhere else, which this install
   * is not short of and must not report. -> `db/schema/entities.ts`
   */
  const record = async (hash: string) => {
    await db!.insert(evidence).values({
      caseId,
      name: `artefact ${hash.slice(0, 4)}`,
      hash,
      storedAt: new Date(),
      createdBy: ANALYST,
      updatedBy: ANALYST,
    })
  }

  /** Evidence the case records and an evidence locker holds. */
  const recordedElsewhere = async (hash: string) => {
    await db!.insert(evidence).values({
      caseId,
      name: `locker ${hash.slice(0, 4)}`,
      hash,
      location: 'the evidence locker, shelf 4',
      createdBy: ANALYST,
      updatedBy: ANALYST,
    })
  }

  const storeAt = (dir: string) => new EvidenceStore({ get: () => dir } as never, {} as never)
  const census = () => new ArtefactCensus(db!, storeAt(root))

  /** Bytes under `hash` in the directory the store keeps `forCase`'s artefacts in. */
  const placed = async (hash: string, forCase = caseId) => {
    await mkdir(join(root, forCase), { recursive: true })
    await writeFile(join(root, forCase, hash), 'here')
  }

  /**
   * What this test added, against what the install already held.
   *
   * **The census answers for the whole install, and this suite shares a
   * database with every other file.** Asserting absolutes here would be a
   * claim about rows somebody else wrote, and would go red the day they wrote
   * one more. The baseline is taken against this test's own empty directory,
   * so every pre-existing artefact counts as missing in both readings and
   * cancels.
   */
  const since = async (before: { expected: number; missing: number }) => {
    const now = await census().take()
    return { expected: now.expected - before.expected, missing: now.missing - before.missing }
  }

  it('says how many it expects and cannot find', async () => {
    const before = await census().take()
    await record(hashFor('a'))
    await record(hashFor('b'))
    await placed(hashFor('a'))

    const held = await since(before)

    expect(held.expected, 'the rows that name an artefact were not counted').toBe(2)
    expect(held.missing, 'an install that lost an artefact reports none missing').toBe(1)
  })

  /**
   * **By digest, because that is how they are stored.** Two rows naming one
   * artefact are one file; counting rows would report an install short of
   * something it holds.
   */
  it('counts one artefact named by two rows once', async () => {
    const before = await census().take()
    await record(hashFor('c'))
    await record(hashFor('c'))

    const held = await since(before)

    expect(held.expected, 'one artefact named twice was counted twice').toBe(1)
    expect(held.missing).toBe(1)
  })

  /**
   * **A row with no hash names no artefact.** Evidence can be recorded before
   * the file is attached, and counting those would report every install as
   * incomplete for ever.
   */
  it('ignores a row that names no artefact', async () => {
    const before = await census().take()
    await record('')
    await record(hashFor('d'))
    await placed(hashFor('d'))

    const held = await since(before)

    expect(held.expected).toBe(1)
    expect(held.missing, 'a row with no artefact was counted as one that is missing').toBe(0)
  })

  /**
   * **Evidence held in a locker is not evidence this install has lost.**
   *
   * A row carries a digest whether or not this app holds the bytes; only
   * `storedAt` says it does, and null is the ordinary case -- most evidence
   * lives elsewhere and the row records where. The archive importer writes
   * exactly this row for every artefact an export left behind, so counting
   * digests would have a handover install report the same absence at every
   * boot for ever, with nothing an operator could do to clear it. A standing
   * false alarm is how the line stops being read, which is the discovery
   * failure this exists to prevent.
   */
  it('does not count evidence the case says is held somewhere else', async () => {
    const before = await census().take()
    await recordedElsewhere(hashFor('h'))

    const held = await since(before)

    expect(
      held.expected,
      'evidence recorded as held elsewhere is counted as an artefact this install expects',
    ).toBe(0)
    expect(held.missing, 'an install that never held those bytes is told it has lost them').toBe(0)
  })

  it('does not count bytes held for another case as this case\u2019s', async () => {
    const before = await census().take()
    await record(hashFor('i'))
    await placed(hashFor('i'), randomUUID())

    expect((await since(before)).missing, 'a digest found under another case was counted as held').toBe(1)
  })

  it('says nothing is missing on an install that holds them all', async () => {
    const before = await census().take()
    await record(hashFor('e'))
    await placed(hashFor('e'))

    expect((await since(before)).missing).toBe(0)
  })

  /**
   * **The artefacts put back afterwards make it whole again**, which is the
   * sibling scenario: an operator has no way to confirm a restore finished
   * unless something reconciles at start.
   */
  it('reports whole again once the artefacts are put back', async () => {
    const before = await census().take()
    await record(hashFor('f'))
    expect((await since(before)).missing).toBe(1)

    await placed(hashFor('f'))

    expect(
      (await since(before)).missing,
      'the artefacts came back and it still says one is gone',
    ).toBe(0)
  })

  /**
   * **Read through the role the server actually runs as.**
   *
   * Every case above measures on `ic_seed`, which reads across cases by
   * policy. `ic_app` does not: `evidence` is case-scoped, and row-level
   * security answers an unscoped query with an empty table rather than an
   * error. So a census that works on the seed handle can report *nothing
   * expected, nothing missing* on every real install -- which is the same
   * answer a healthy install gives, and the exact silence #179 is about.
   */
  it('counts what the install holds when the application asks', async () => {
    const asApp = () => new ArtefactCensus(appDb!, storeAt(root))
    const before = await asApp().take()
    await record(hashFor('g'))

    const now = await asApp().take()

    expect(
      now.expected - before.expected,
      'the application sees no artefact it expects, so an install short of them cannot say so',
    ).toBe(1)
  })

  /**
   * **An install with no evidence at all is not a broken one**, which is the
   * state a fresh install is in: answering anything but zero there would
   * report every new install as damaged.
   *
   * **The rows are stubbed for this one case, and only this one.** Emptying
   * the table would answer it honestly and take every other file's evidence
   * with it -- these run in one process against one database. What is being
   * asserted is arithmetic over an empty answer, and the database is not the
   * part under test.
   */
  it('reports nothing expected on an install holding no evidence', async () => {
    const empty = { select: () => ({ from: () => Promise.resolve([]) }) }

    const held = await new ArtefactCensus(empty as never, storeAt(root)).take()

    expect(held).toEqual({ expected: 0, missing: 0 })
  })
})

/**
 * **What an operator is told in the first minute.**
 *
 * A count is only half of what the requirement asks for -- *so that a restore
 * can say what is missing* puts the burden on the install to speak rather than
 * on somebody to go looking. Asserted as properties of the line rather than as
 * the sentence, so rewording it is free and dropping the numbers or the
 * severity is not.
 */
describe('what an install says at start', () => {
  it('says nothing at all when it expects no artefacts', () => {
    // The state a fresh install is in. A line here would have every new
    // install report on a restore that never happened.
    expect(saysAtStart({ expected: 0, missing: 0 })).toBeNull()
  })

  it('warns with both numbers when it cannot find some of them', () => {
    const said = saysAtStart({ expected: 9, missing: 4 })

    expect(said?.level, 'an install short of its evidence reports at the ordinary level').toBe(
      'warn',
    )
    expect(said?.message, 'the line does not say how many are gone').toContain('4')
    expect(said?.message, 'the line does not say how many were expected').toContain('9')
  })

  it('confirms rather than staying silent when it holds them all', () => {
    // Silence cannot be told from a check that did not run, which is the
    // reading an operator who has just put a directory back needs to rule out.
    const said = saysAtStart({ expected: 9, missing: 0 })

    expect(said?.level).toBe('log')
    expect(said?.message).toContain('9')
  })
})

/**
 * **That start is when it is said, rather than when somebody asks.**
 *
 * A census nothing calls answers the requirement on paper and not at all in
 * the product -- *does not wait for somebody to open a case to discover it* is
 * a claim about the call, so the call is what these assert.
 */
describe('the install saying it at start', () => {
  const censusOf = (held: Census | Error) =>
    ({
      take: () => (held instanceof Error ? Promise.reject(held) : Promise.resolve(held)),
    }) as never

  it('reports what the census counted when the application comes up', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)

    await new HealthModule(censusOf({ expected: 9, missing: 4 })).onApplicationBootstrap()

    expect(warn, 'nothing was said at start, so the census answers only when asked').toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]?.[0]).toContain('4')
    warn.mockRestore()
  })

  /**
   * **A census that cannot be taken is not a reason to refuse the install.**
   * It holds every case and every record either way, and the directory being
   * absent is the very state this exists to report.
   */
  it('comes up anyway when the census throws', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)

    await expect(
      new HealthModule(censusOf(new Error('no such directory'))).onApplicationBootstrap(),
    ).resolves.toBeUndefined()

    expect(warn, 'the install swallowed a census it could not take').toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})
