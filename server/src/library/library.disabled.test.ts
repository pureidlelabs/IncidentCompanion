/**
 * Switching a built-in off, and every place that had to stop offering it.
 *
 * **The column was written, exported and read by nothing.** `applyKind` set it
 * and answered `disabledBuiltins: 2`, `exportKind` round-tripped it, and both
 * listings ignored it - so an operator got a receipt for a change the install
 * had not made, which is worse than a refusal. These hold the contract the
 * schema states: still on the pane, gone from the menus.
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

describe.skipIf(!db)('a disabled built-in', () => {
  let controller: LibraryController
  let service: LibraryService

  beforeEach(async () => {
    await seed!.delete(library)
    service = new LibraryService(db!, seed)
    await service.seedBuiltIns()
    controller = new LibraryController(service, audit as never)
  })

  afterAll(async () => {
    await pool!.end()
  })

  /** Switch off whichever built-in the install actually shipped, never a name typed here. */
  async function switchOff(slug: string): Promise<string> {
    const [first] = (await service.list(slug)).filter((row) => row.origin === 'built-in')
    if (!first) throw new Error(`no built-in in ${slug} to switch off`)
    await service.applyKind(slug, { kind: slug, entries: [], disabledBuiltins: [first.name] })
    return first.name
  }

  it('leaves the pane, so it can be switched back on', async () => {
    const name = await switchOff('templates')
    const listing = await controller.listing('templates')

    const row = listing.entries.find((one) => one.name === name)
    expect(row).toBeDefined()
    // **The flag has to reach the row.** Present but indistinguishable is the
    // same dead end: the pane cannot draw what it cannot see.
    expect(row?.disabled).toBe(true)
  })

  it('is no longer a start-from option', async () => {
    const name = await switchOff('templates')
    const listing = await controller.listing('templates')

    expect(listing.startOptions.map((one) => one.value)).not.toContain(name)
    // Blank survives - it is not a row and cannot be switched off.
    expect(listing.startOptions[0]).toEqual({ value: '', label: 'Blank' })
  })

  it('is no longer in the report snippet menu', async () => {
    const name = await switchOff('report-snippets')

    const offered = await service.listWithPayload('report-snippets')
    expect(offered.map((one) => one.name)).not.toContain(name)
    // **The rest of the menu is untouched**, so this is a filter rather than a
    // query that stopped matching.
    expect(offered.length).toBeGreaterThan(0)
  })

  it('is no longer in the New report layout list', async () => {
    const name = await switchOff('report-layouts')

    const offered = await service.listWithPayload('report-layouts')
    expect(offered.map((one) => one.name)).not.toContain(name)
  })

  it('still carries its payload for everything that reads one', async () => {
    const name = await switchOff('templates')
    // The editor route reads a built-in deliberately, and switching one off is
    // not a reason to stop being able to look at it.
    expect((await service.entry('templates', name))?.payload).toBeDefined()
  })

  it('is switched back on by a document that stops naming it', async () => {
    const name = await switchOff('templates')
    await service.applyKind('templates', { kind: 'templates', entries: [], disabledBuiltins: [] })

    const listing = await controller.listing('templates')
    expect(listing.entries.find((one) => one.name === name)?.disabled).toBe(false)
    expect(listing.startOptions.map((one) => one.value)).toContain(name)
  })

  it('does not free its name for somebody else to take', async () => {
    // **The unique index is on `(kind, name)` whatever `disabled` says.** A
    // create that reused the name would rewrite the built-in's own row, and the
    // next boot would put the shipped content back over the operator's.
    const name = await switchOff('templates')
    await expect(
      controller.apply(
        'templates',
        { kind: 'templates', entries: [{ name, label: 'Mine', payload: {} }] },
        { id: 'u-1', name: 'Ada' } as never,
        { headers: {} },
      ),
    ).rejects.toThrow()
  })
})
