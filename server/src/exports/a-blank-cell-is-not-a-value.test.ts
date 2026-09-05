/**
 * A cell a row left blank is a field nobody gave, not a field set to nothing.
 *
 * > #### Scenario: A blank value
 * > - GIVEN a file in which a row leaves a value blank
 * > - WHEN it is imported
 * > - THEN that field is treated as not given
 * > - AND it is not written as an empty value
 *
 * **Driven on a collection whose blank cells are not all text.** `systems` --
 * which the existing round-trip cases use -- is text almost throughout, and a
 * blank arriving as `''` is indistinguishable there from the column's own
 * default. `evidence` carries a reference and a timestamp, where *not given*
 * and *the empty string* are different values and only one of them is one the
 * column can hold.
 *
 * **The export is the file, not a file written here.** A hand-written CSV would
 * test the parser against a fixture somebody chose; what the requirement is
 * about is the application reading back what it wrote, so the file under test
 * is the one the export produced.
 *
 * **The blankness is asserted before the import.** A file whose cells turned
 * out not to be blank would pass every case below without exercising anything.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ExportsController } from './exports.controller.js'
import { ImportService } from './import.service.js'
import { CollectionService } from '../collections/collection.service.js'
import { cases, evidence, user } from '../db/schema/index.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

const ME = 'blank-cell-analyst'

/** The columns this row leaves unset, each of a kind the empty string is not. */
const LEFT_BLANK = ['system_id', 'account_id', 'collected_at'] as const

let service: ImportService
let exports_: ExportsController
let fromId = ''
let intoId = ''
let file = ''

describe.skipIf(!db)('a row that left a value blank', () => {
  beforeAll(async () => {
    const now = new Date()
    await seed!
      .insert(user)
      .values({
        id: ME,
        name: 'Blank Cell Analyst',
        email: `${ME}@example.test`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()

    const [from] = await seed!
      .insert(cases)
      .values({ title: 'A case whose evidence names no host' })
      .returning({ id: cases.id })
    fromId = from!.id

    const [into] = await seed!
      .insert(cases)
      .values({ title: 'A case the file is imported into' })
      .returning({ id: cases.id })
    intoId = into!.id

    await seed!.insert(evidence).values({
      caseId: fromId,
      name: 'a note about the intrusion',
      type: 'system logs',
    })

    const collections = new CollectionService(db!)
    service = new ImportService(collections)
    exports_ = new ExportsController(collections, service)
    file = await exports_.collectionCsv(fromId, 'evidence')
  }, 90_000)

  afterAll(async () => {
    if (fromId !== '') await seed!.delete(cases).where(eq(cases.id, fromId))
    if (intoId !== '') await seed!.delete(cases).where(eq(cases.id, intoId))
    await pool!.end()
  })

  it.each(LEFT_BLANK)('writes %s out blank, so the import below has one to read', (column) => {
    const [header, row] = file.trim().split('\n')
    const at = (header ?? '').split(',').indexOf(column)

    expect(
      at,
      `the export writes no ${column} column, so nothing here is about it`,
    ).toBeGreaterThan(-1)
    expect(
      (row ?? '').split(',')[at],
      `${column} came out of the export carrying something, so it is not a blank cell`,
    ).toBe('')
  })

  it('takes the file back rather than refusing it for the blanks', async () => {
    const { added } = await service.fromCsv('evidence', intoId, file, ME)

    expect(
      added,
      'the file the application wrote was refused when handed back, so a row with a field ' +
        'left unset cannot survive an export',
    ).toBe(1)
  })

  it('leaves the blank fields unset rather than empty', async () => {
    const [written] = await seed!.select().from(evidence).where(eq(evidence.caseId, intoId))

    expect(written, 'the import wrote no row').toBeDefined()
    expect(
      written!.systemId,
      'a blank cell was written as a value rather than left unset, so the row now claims a ' +
        'host it does not have',
    ).toBeNull()
    expect(written!.accountId, 'a blank account cell was written as a value').toBeNull()
    expect(written!.collectedAt, 'a blank timestamp cell was written as a value').toBeNull()
    expect(
      written!.name,
      'the value that was given did not survive, so this says nothing about the blanks',
    ).toBe('a note about the intrusion')
  })
})
