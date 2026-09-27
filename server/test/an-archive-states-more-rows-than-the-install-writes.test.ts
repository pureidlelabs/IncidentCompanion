/**
 * Reading an archive writes no more rows than the install's ceiling allows, and
 * refuses one that states more before writing any; and the install never
 * writes an archive it would refuse to read back.
 */
import { randomUUID } from 'node:crypto'
import { drizzle } from 'drizzle-orm/node-postgres'
import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'
import { openTestPool } from './database.js'
import { cases } from '../src/db/schema/case.js'
import { caseNotes } from '../src/db/schema/tracker.js'
import { CASE_NAME, MANIFEST_NAME, pack, readArchive } from '../src/archive/format.js'
import { ARCHIVE_ROWS, ARCHIVE_ROWS_FLOOR } from '../src/policy/keys.js'

const LIMITS = { memberBytes: 64 * 1024 * 1024, totalBytes: 128 * 1024 * 1024 }

describe.skipIf(!(await bootable()))('how many rows an archive may describe', () => {
  let harness: Harness
  let admin: Persona
  const pool = openTestPool(process.env['SEED_DATABASE_URL'] ?? process.env['DATABASE_URL']!, 'ic_seed')
  const seed = drizzle({ client: pool })
  const made: string[] = []
  let template: Record<string, Uint8Array> = {}

  async function call(method: string, path: string, body?: unknown, type = 'application/json') {
    return fetch(`${harness.base}${path}`, {
      method,
      headers: { cookie: admin.cookie, 'content-type': type, origin: harness.origin },
      ...(body === undefined ? {} : { body: type === 'application/json' ? JSON.stringify(body) : (body as BodyInit) }),
    })
  }

  const setCeiling = async (rows: number) => {
    const set = await call('PUT', '/api/install/policy', { key: 'evidence.archiveRows', value: rows })
    expect(set.status, await set.text()).toBeLessThan(300)
  }

  /** An archive of a case titled `title` holding `notes` notes, and nothing else. */
  async function archiveOf(title: string, notes: number): Promise<Uint8Array> {
    const record = JSON.parse(new TextDecoder().decode(template[CASE_NAME])) as Record<string, unknown>
    record.title = title
    record.casenotes = Array.from({ length: notes }, (_, at) => ({ id: randomUUID(), note: `line ${String(at)}` }))
    const members: Record<string, Uint8Array> = Object.fromEntries(
      Object.entries(template).filter(([name]) => name !== MANIFEST_NAME),
    )
    members[CASE_NAME] = new TextEncoder().encode(JSON.stringify(record))
    return pack(members, 'omitted', [])
  }

  const importing = (archive: Uint8Array) =>
    call('POST', '/api/cases/import', new Uint8Array(archive), 'application/octet-stream')

  const casesTitled = async (title: string) =>
    (await seed.select({ id: cases.id }).from(cases).where(eq(cases.title, title))).length

  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    const made_ = (await (await call('POST', '/api/cases', { title: 'Row ceiling template' })).json()) as { id: string }
    made.push(made_.id)
    const out = await call('POST', `/api/cases/${made_.id}/archive`, { includeFiles: false })
    template = (await readArchive(Buffer.from(await out.arrayBuffer()), LIMITS)).members
    await setCeiling(ARCHIVE_ROWS_FLOOR)
  }, 120_000)

  afterAll(async () => {
    await setCeiling(ARCHIVE_ROWS)
    const titled = await seed.select({ id: cases.id }).from(cases).where(inArray(cases.title, [
      'One row past the ceiling',
      'Exactly at the ceiling',
      'At the ceiling in notes, past it with an asset',
    ]))
    const ids = [...made, ...titled.map((row) => row.id)]
    if (ids.length > 0) await seed.delete(cases).where(inArray(cases.id, ids))
    await pool.end()
    await harness?.close()
  })

  it('refuses an archive stating one row past the ceiling, naming the ceiling, and writes none of it', async () => {
    const answer = await importing(await archiveOf('One row past the ceiling', ARCHIVE_ROWS_FLOOR + 1))
    const body = (await answer.json()) as { message?: string }

    expect({
      status: answer.status,
      named: body.message?.includes(ARCHIVE_ROWS_FLOOR.toLocaleString('en-GB')),
      written: await casesTitled('One row past the ceiling'),
    }).toEqual({ status: 422, named: true, written: 0 })
  })

  // A first row no install could write: a refusal naming the ceiling was reached before any row was.
  it('refuses by the ceiling before it tries to write a single row', async () => {
    const archive = JSON.parse(new TextDecoder().decode(template[CASE_NAME])) as Record<string, unknown>
    archive.title = 'One row past the ceiling, the first unwritable'
    archive.casenotes = [
      { id: randomUUID(), note: 42 },
      ...Array.from({ length: ARCHIVE_ROWS_FLOOR }, (_, at) => ({ id: randomUUID(), note: `line ${String(at)}` })),
    ]
    const members: Record<string, Uint8Array> = Object.fromEntries(
      Object.entries(template).filter(([name]) => name !== MANIFEST_NAME),
    )
    members[CASE_NAME] = new TextEncoder().encode(JSON.stringify(archive))
    const answer = await importing(await pack(members, 'omitted', []))
    const body = (await answer.json()) as { message?: string }

    expect({ status: answer.status, message: body.message }).toEqual({
      status: 422,
      message: expect.stringContaining(`reads at most ${ARCHIVE_ROWS_FLOOR.toLocaleString('en-GB')}`),
    })
  })

  it('counts every collection an archive states toward the ceiling', async () => {
    const archive = JSON.parse(new TextDecoder().decode(template[CASE_NAME])) as Record<string, unknown>
    archive.title = 'At the ceiling in notes, past it with an asset'
    archive.casenotes = Array.from({ length: ARCHIVE_ROWS_FLOOR }, (_, at) => ({ id: randomUUID(), note: `line ${String(at)}` }))
    archive.systems = [{ id: randomUUID(), hostname: 'one-asset-too-many' }]
    const members: Record<string, Uint8Array> = Object.fromEntries(
      Object.entries(template).filter(([name]) => name !== MANIFEST_NAME),
    )
    members[CASE_NAME] = new TextEncoder().encode(JSON.stringify(archive))
    const answer = await importing(await pack(members, 'omitted', []))
    const body = (await answer.json()) as { message?: string }

    expect({
      status: answer.status,
      named: body.message?.includes(ARCHIVE_ROWS_FLOOR.toLocaleString('en-GB')),
      written: await casesTitled('At the ceiling in notes, past it with an asset'),
    }).toEqual({ status: 422, named: true, written: 0 })
  })

  it('reads an archive stating exactly as many rows as the ceiling', async () => {
    const answer = await importing(await archiveOf('Exactly at the ceiling', ARCHIVE_ROWS_FLOOR))

    expect(answer.status, await answer.clone().text()).toBe(201)
  })

  it('refuses to archive a case past the ceiling, naming the ceiling', async () => {
    const big = (await (await call('POST', '/api/cases', { title: 'Too large to carry' })).json()) as { id: string }
    made.push(big.id)
    await seed.insert(caseNotes).values(
      Array.from({ length: ARCHIVE_ROWS_FLOOR + 1 }, (_, at) => ({ caseId: big.id, note: `line ${String(at)}` })),
    )

    const answer = await call('POST', `/api/cases/${big.id}/archive`, { includeFiles: false })
    const body = (await answer.json()) as { message?: string }

    expect({ status: answer.status, named: body.message?.includes(ARCHIVE_ROWS_FLOOR.toLocaleString('en-GB')) }).toEqual({
      status: 422,
      named: true,
    })
  })
})
