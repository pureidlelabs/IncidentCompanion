/**
 * Writing a library entry - the half a read-only browser check cannot see,
 * where the route and the client can disagree about the body while the
 * listing renders perfectly.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { LibraryController } from './library.controller.js'
import { LibraryService } from './library.service.js'
import { library } from '../db/schema/library.js'
import { openTestPool } from '../../test/database.js'

/**
 * The audit this controller writes to.
 *
 * **Recording rather than absent.** `InstallActivityService` was added to the
 * constructor and these tests were never given one, so `this.activity` was
 * `undefined` -- harmless only because every case here drives a refusal and
 * stops before the write. A stand-in keeps the constructor honest and makes
 * the line assertable when somebody drives the other half.
 */
const audited: unknown[] = []
const audit = {
  libraryKindReplaced: (...args: unknown[]) => {
    audited.push(args)
    return Promise.resolve()
  },
}



const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

describe.skipIf(!db)('writing to a library', () => {
  let controller: LibraryController
  let service: LibraryService

  beforeEach(async () => {
    await seed!.delete(library)
    service = new LibraryService(db!, seed)
    // The shipped rows are what a Start-from list is built out of.
    await service.seedBuiltIns()
    controller = new LibraryController(service, audit as never)
  })

  afterAll(async () => {
    await pool!.end()
  })

  /**
   * **Blank leads, and its value is the empty string.** A sentinel name would
   * collide with a real entry the day somebody calls one `blank`.
   */
  it('offers Blank first for a library that allows one', async () => {
    const listing = await controller.listing('templates')

    expect(listing.startOptions[0]).toEqual({ value: '', label: 'Blank' })
    expect(listing.startOptions.map((one) => one.value)).toContain('ransomware')
  })

  it('writes an entry from one field, deriving the key from it', async () => {
    const written = await controller.create('templates', { label: 'My Own Playbook' })

    expect(written.messages[0]?.[0]).toContain('My Own Playbook')
    const row = await service.entry('templates', 'my-own-playbook')
    expect(row?.label).toBe('My Own Playbook')
    expect(row?.builtin).toBe(false)
  })

  /**
   * **Blank is the payload schema's defaults, not `{}`.** A row whose payload
   * is missing the arrays the reader maps over is a crash at the far end, and
   * the far end is the case-create path.
   */
  it('starts a blank entry on a payload the seeder can read', async () => {
    await controller.create('templates', { label: 'Empty one' })

    const row = await service.entry('templates', 'empty-one')
    expect(row?.payload).toMatchObject({ actions: [], evidence: [], notes: [] })
  })

  it('copies the checklist when asked to start from another entry', async () => {
    const source = await service.entry('templates', 'ransomware')

    await controller.create('templates', { label: 'Mine', startFrom: 'ransomware' })

    const row = await service.entry('templates', 'mine')
    expect(row?.payload).toEqual(source?.payload)
    // A copy of a built-in is the analyst's, or they could not edit it.
    expect(row?.builtin).toBe(false)
  })

  it('refuses a start-from that does not exist rather than writing an empty one', async () => {
    await expect(
      controller.create('templates', { label: 'Nope', startFrom: 'not-a-template' }),
    ).rejects.toThrow()

    expect(await service.entry('templates', 'nope')).toBeUndefined()
  })

  /**
   * **Two entries may share a label**, so the derived key has to give way. The
   * alternative - refusing the second - asks the analyst to invent a name that
   * differs from one they cannot see.
   */
  it('makes room when a derived key is taken', async () => {
    await controller.create('templates', { label: 'Same name' })
    await controller.create('templates', { label: 'Same name' })

    expect(await service.entry('templates', 'same-name')).toBeDefined()
    expect(await service.entry('templates', 'same-name-2')).toBeDefined()
  })

  /** A label of punctuation slugifies to nothing, and a row keyed `''` is unaddressable. */
  it('keys an unslugifiable label on something a route can address', async () => {
    await controller.create('templates', { label: '!!!' })

    const rows = await service.list('templates')
    const mine = rows.find((row) => row.label === '!!!')
    expect(mine?.name).toBe('entry')
  })

  it('refuses a body with no label at all', async () => {
    await expect(controller.create('templates', {})).rejects.toThrow()
  })

  /**
   * **A library with no payload schema cannot be written to**, and says so
   * rather than writing a row the report tier will never read.
   */
  it('refuses a New for a library that cannot be authored yet', async () => {
    await expect(controller.create('report-layouts', { label: 'Nope' })).rejects.toThrow()
  })

  it('does not offer Blank for a library that has no blank', async () => {
    const listing = await controller.listing('report-layouts')

    expect(listing.startOptions.map((one) => one.label)).not.toContain('Blank')
  })

  /**
   * The refusal `create` already makes, on the door that skipped it: a kind
   * declaring no payload schema was the one kind nothing validated, and an
   * unusable row there breaks the New report dialog for the whole install.
   */
  it('refuses a document for a library that cannot be authored yet', async () => {
    await expect(
      controller.apply(
        'report-layouts',
        { kind: 'report-layouts', entries: [{ name: 'x', label: 'X', payload: { blocks: 'nope' } }] },
        { id: 'u-1', name: 'Ada' } as never,
        { headers: {} },
      ),
    ).rejects.toThrow()

    expect(await service.entry('report-layouts', 'x')).toBeUndefined()
  })
})
