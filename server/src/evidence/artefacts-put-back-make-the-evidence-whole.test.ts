/**
 * Artefacts put back beside a restored install make the evidence whole, and
 * the record was never touched in the meantime.
 *
 * *A copy of the database MUST name which artefacts it expects to find beside
 * it, so that a restore can say what is missing rather than discovering it when
 * somebody opens a case.*
 *
 * > #### Scenario: The artefacts are restored afterwards
 * > - GIVEN an install restored without its artefacts
 * > - WHEN the artefacts are put back beside it
 * > - THEN the evidence is whole again
 * > - AND nothing had to be re-recorded
 *
 * **The second clause is the one with teeth, and it is about the database.**
 * *Whole again* is satisfied by anything that can read the bytes; *nothing had
 * to be re-recorded* says the row that names the artefact survived its absence
 * unchanged, so an operator who puts a directory back is finished rather than
 * facing a case whose evidence has to be entered again. So the row is read
 * before, during and after, and asserted identical all three times -- its
 * version included, because a row silently rewritten on the way through has
 * been re-recorded whether or not anybody typed it.
 *
 * **The absence is a real one.** The artefact is moved out of the store rather
 * than the store being mocked, so what the case does in the meantime is what it
 * would do on an install restored from a database copy alone.
 *
 * **Content addressing is what makes this true and is asserted rather than
 * assumed:** the artefact returns under the digest it left under, and `verify`
 * re-reads the bytes rather than comparing a stored digest with itself.
 *
 * **What this does not cover:** that the install says at start how many
 * artefacts it expects and cannot find. Nothing counts them -- `backup.sh`
 * names no artefact and no bootstrap reads the store. -> #179
 */
import { mkdtemp, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { EvidenceStore } from './store.js'
import { cases } from '../db/schema/case.js'
import { evidence } from '../db/schema/entities.js'
import { openTestPool } from '../../test/database.js'

/** The store reads one key off a ConfigService and nothing else. */
const configFor = (dir: string) => ({ get: () => dir }) as never

const bytesOf = (text: string) => Readable.from([Buffer.from(text)]) as AsyncIterable<Buffer>

const ARTEFACT = 'the proxy log the case rests on\n'

const URL_ = process.env.SEED_DATABASE_URL ?? process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_seed') : null
const db = pool ? drizzle({ client: pool }) : null

let root = ''
let aside = ''
let store: EvidenceStore
let hash = ''
let caseId = ''

/** The whole row, so nothing about it can change without this seeing it. */
const recorded = async () => {
  const [row] = await db!.select().from(evidence).where(eq(evidence.caseId, caseId))
  return row
}

describe.skipIf(!db)('an install restored without its artefacts', () => {
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'evidence-restored-'))
    aside = await mkdtemp(join(tmpdir(), 'evidence-elsewhere-'))
    store = new EvidenceStore(configFor(root))

    const stored = await store.put(bytesOf(ARTEFACT), 'proxy.log')
    hash = stored.hash

    const [made] = await db!
      .insert(cases)
      .values({ title: 'A case whose evidence went missing and came back' })
      .returning({ id: cases.id })
    caseId = made!.id

    await db!.insert(evidence).values({ caseId, name: 'proxy.log', hash, type: 'log' })
  }, 90_000)

  afterAll(async () => {
    if (caseId !== '') await db!.delete(cases).where(eq(cases.id, caseId))
    await pool!.end()
    await rm(root, { recursive: true, force: true })
    await rm(aside, { recursive: true, force: true })
  })

  it('holds the artefact and the row that names it to begin with', async () => {
    expect(await store.read(hash), 'the artefact was never stored').not.toBeNull()
    expect(
      Buffer.from((await store.read(hash))!).toString(),
      'the store handed back something other than what it was given',
    ).toBe(ARTEFACT)
    expect((await recorded())?.hash, 'the row does not name the artefact').toBe(hash)
  })

  it('loses the bytes and keeps the record when the artefacts are not there', async () => {
    const before = await recorded()
    await rename(join(root, hash), join(aside, hash))

    expect(
      await store.read(hash),
      'the artefact is still readable, so what follows is not a restore without it',
    ).toBeNull()
    expect(await store.verify(hash), 'the store vouches for an artefact it does not hold').toBe(
      false,
    )
    expect(
      await recorded(),
      'the row changed when its artefact went missing, so a database copy restored alone is ' +
        'already not the record it was',
    ).toEqual(before)
  })

  it('is whole again when the artefacts are put back, with nothing re-recorded', async () => {
    const during = await recorded()
    await rename(join(aside, hash), join(root, hash))

    expect(
      Buffer.from((await store.read(hash))!).toString(),
      'the artefact came back as something other than what was stored',
    ).toBe(ARTEFACT)
    expect(
      await store.verify(hash),
      'the artefact no longer hashes to its own name, so it is not the file the row vouches for',
    ).toBe(true)
    expect(
      await recorded(),
      'the row changed when its artefact returned, so something had to be re-recorded to ' +
        'make the evidence whole',
    ).toEqual(during)
  })
})
