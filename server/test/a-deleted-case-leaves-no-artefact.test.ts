/**
 * What a case stored leaves the install when the case, or the row naming it,
 * does -- and what a sent report froze stays.
 *
 * Read from the evidence directory by content, never by layout. The start-up
 * half boots a second install over the same directory and database, which is
 * the only way to run what an install does as it comes up.
 */
import { randomBytes, randomInt, randomUUID } from 'node:crypto'
import { rename, rmdir } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'

import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Uint8ArrayReader, Uint8ArrayWriter, ZipReader } from '@zip.js/zip.js'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  boot,
  bootable,
  grantsItselfDelete,
  sharedAdmin,
  type Harness,
  type Persona,
} from './app-harness.js'
import { CASE_NAME, EVIDENCE_PREFIX, pack, sha256 } from '../src/archive/format.js'
import { cases } from '../src/db/schema/case.js'
import { evidence } from '../src/db/schema/entities.js'
import { EvidenceStore } from '../src/evidence/store.js'
import { openTestPool } from './database.js'
import { age, holders, suiteStore } from './evidence-on-disk.js'

let h: Harness
let who: Persona
let root = ''
const made: string[] = []
const seedPool = openTestPool(process.env['SEED_DATABASE_URL'] ?? process.env['DATABASE_URL']!, 'ic_seed')
const seed = drizzle({ client: seedPool })

const unique = (what: string) => Buffer.concat([Buffer.from(`${what} `), randomBytes(16)])

const call = (method: string, path: string, body?: unknown, type = 'application/json') =>
  fetch(`${h.base}${path}`, {
    method,
    headers: { cookie: who.cookie, ...(body === undefined ? {} : { 'content-type': type }) },
    body: body === undefined ? undefined : body instanceof Uint8Array ? new Uint8Array(body) : JSON.stringify(body),
  })

async function ok(answer: Promise<Response>, status: number): Promise<Response> {
  const got = await answer
  expect(got.status, await got.clone().text()).toBe(status)
  return got
}

async function opened(title: string, reference = ''): Promise<string> {
  const answer = await ok(call('POST', '/api/cases', { title, ...(reference ? { reference } : {}) }), 201)
  const { id } = (await answer.json()) as { id: string }
  made.push(id)
  return id
}

async function row(caseId: string, name: string): Promise<string> {
  const answer = await ok(call('POST', `/api/cases/${caseId}/evidence`, { name }), 201)
  return ((await answer.json()) as { id: string }).id
}

async function attach(caseId: string, id: string, bytes: Buffer): Promise<void> {
  await ok(
    fetch(`${h.base}/api/cases/${caseId}/evidence/${id}/file`, {
      method: 'POST',
      headers: { cookie: who.cookie, 'content-type': 'application/octet-stream', 'x-original-filename': 'a.bin' },
      body: new Uint8Array(bytes),
    }),
    200,
  )
}

async function versionOf(caseId: string, id: string): Promise<number> {
  const listed = (await (await ok(call('GET', `/api/cases/${caseId}/evidence`), 200)).json()) as { id: string; version: number }[]
  return listed.find((one) => one.id === id)!.version
}

describe.skipIf(!(await bootable()))('what a case stored goes when nothing names it', () => {
  beforeAll(async () => {
    h = await boot()
    root = h.app.get(ConfigService).get<string>('EVIDENCE_DIR')!
    who = await sharedAdmin(h)
    await grantsItselfDelete(h, who)
  }, 120_000)

  afterAll(async () => {
    for (const id of made) await seed.delete(cases).where(eq(cases.id, id))
    await seedPool.end()
    await h?.close()
  })

  it('takes a deleted case\u2019s artefacts with it', async () => {
    const bytes = unique('held by a case about to go')
    const caseId = await opened('Deleted with its evidence')
    await attach(caseId, await row(caseId, 'dump'), bytes)
    expect(await holders(root, bytes), 'the attach stored nothing, so the delete below proves nothing').toHaveLength(1)

    await ok(call('DELETE', `/api/cases/${caseId}`), 200)

    expect(await holders(root, bytes), 'the case is gone and its artefact is still on disk').toEqual([])
  })

  it('takes a refused archive\u2019s artefacts with the case it was refused', async () => {
    const reference = `INC-${randomBytes(4).toString('hex')}`
    await opened('Holds the reference', reference)
    const carried = unique('carried by a refused archive')
    const record = {
      title: 'Refused',
      reference,
      evidence: [{ name: 'carried', hash: sha256(carried), originalFilename: 'c.bin' }],
    }
    const archive = await pack(
      { [CASE_NAME]: new TextEncoder().encode(JSON.stringify(record)), [`${EVIDENCE_PREFIX}${sha256(carried)}`]: carried },
      'included',
    )

    await ok(call('POST', '/api/cases/import', archive, 'application/octet-stream'), 409)

    expect(await holders(root, carried), 'a refused import left its artefact behind').toEqual([])
  })

  describe('when a row stops naming its bytes', () => {
    const deleted = async (caseId: string, id: string) =>
      ok(call('DELETE', `/api/cases/${caseId}/evidence/${id}?version=${String(await versionOf(caseId, id))}`), 200)

    it('removes them when the row is deleted', async () => {
      const bytes = unique('its row is deleted')
      const caseId = await opened('Row deleted')
      const id = await row(caseId, 'deleted')
      await attach(caseId, id, bytes)

      await deleted(caseId, id)

      expect(await holders(root, bytes), 'the row is gone and its bytes are still on disk').toEqual([])
    })

    it('removes them when a selection takes the row', async () => {
      const bytes = unique('its row is deleted in a selection')
      const caseId = await opened('Selection deleted')
      const id = await row(caseId, 'selected')
      await attach(caseId, id, bytes)

      const body = { targets: [{ collection: 'evidence', rows: [{ id, version: await versionOf(caseId, id) }] }] }
      await ok(call('POST', `/api/cases/${caseId}/bulk-delete`, body), 200)

      expect(await holders(root, bytes), 'the selection is gone and its bytes are still on disk').toEqual([])
    })

    it('removes what a row held before its file was replaced', async () => {
      const before = unique('replaced by another file')
      const caseId = await opened('File replaced')
      const id = await row(caseId, 'replaced')
      await attach(caseId, id, before)

      await attach(caseId, id, unique('the file that replaced it'))

      expect(await holders(root, before), 'the row names other bytes and the old ones are still on disk').toEqual([])
    })

    it('keeps them while another row of the case still names them', async () => {
      const bytes = unique('named by two rows')
      const caseId = await opened('Named twice')
      const going = await row(caseId, 'going')
      const staying = await row(caseId, 'staying')
      await attach(caseId, going, bytes)
      await attach(caseId, staying, bytes)

      await deleted(caseId, going)

      await ok(call('GET', `/api/cases/${caseId}/evidence/${staying}/file`), 200)
    })

    it('removes one case\u2019s copy and keeps the other case\u2019s', async () => {
      const bytes = unique('attached in two cases')
      const [dropping, keeping] = [await opened('Drops its copy'), await opened('Keeps its copy')]
      const dropped = await row(dropping, 'dropped')
      const kept = await row(keeping, 'kept')
      await attach(dropping, dropped, bytes)
      await attach(keeping, kept, bytes)

      await deleted(dropping, dropped)

      expect(await holders(root, bytes), 'a case kept bytes because another case names them').toHaveLength(1)
      await ok(call('GET', `/api/cases/${keeping}/evidence/${kept}/file`), 200)
    })

    /** Holds an attach between its bytes landing in the case and the row naming them being written. */
    const holdingTheAttach = () => {
      const proto = EvidenceStore.prototype as unknown as Record<'keep', (...args: unknown[]) => Promise<unknown>>
      const keep = proto.keep
      let placed = () => {}
      const landed = new Promise<void>((resolve) => (placed = resolve))
      let open = () => {}
      const gate = new Promise<void>((resolve) => (open = resolve))
      proto.keep = async function (this: unknown, ...args: unknown[]) {
        const kept = await keep.apply(this, args)
        placed()
        await gate
        return kept
      }
      return { landed, open, restore: () => (proto.keep = keep) }
    }

    it('keeps bytes being attached to one row while another row naming them is deleted', async () => {
      const bytes = unique('attached again as its first row goes')
      const caseId = await opened('Attached as released')
      const first = await row(caseId, 'first')
      const second = await row(caseId, 'second')
      await attach(caseId, first, bytes)
      const version = await versionOf(caseId, first)

      const held = holdingTheAttach()
      try {
        const attaching = attach(caseId, second, bytes)
        await held.landed
        const deleting = call('DELETE', `/api/cases/${caseId}/evidence/${first}?version=${String(version)}`)
        await Promise.race([deleting, new Promise((resolve) => setTimeout(resolve, 1000))])
        held.open()
        await attaching
        expect((await deleting).status).toBe(200)
      } finally {
        held.restore()
      }

      expect(await holders(root, bytes), 'the delete removed bytes the other row was being given').toHaveLength(1)
      await ok(call('GET', `/api/cases/${caseId}/evidence/${second}/file`), 200)
    })

    it('leaves nothing behind when the row moved while its bytes arrived', async () => {
      const bytes = unique('arrived for a row somebody else had just changed')
      const caseId = await opened('Moved under an attach')
      const id = await row(caseId, 'moved')
      const version = await versionOf(caseId, id)

      const held = holdingTheAttach()
      let answered: number
      try {
        const attaching = fetch(`${h.base}/api/cases/${caseId}/evidence/${id}/file`, {
          method: 'POST',
          headers: { cookie: who.cookie, 'content-type': 'application/octet-stream' },
          body: new Uint8Array(bytes),
        })
        await held.landed
        await ok(call('PATCH', `/api/cases/${caseId}/evidence/${id}`, { version, name: 'renamed first' }), 200)
        held.open()
        answered = (await attaching).status
      } finally {
        held.restore()
      }

      expect(answered, 'the attach did not meet the row having moved').toBe(409)
      expect(await holders(root, bytes), 'a refused attach left its bytes in the case').toEqual([])
    })

    it('keeps none of what an archive carried that nothing in its case names', async () => {
      const carried = unique('carried by an archive, named by none of its rows')
      const archive = await pack(
        {
          [CASE_NAME]: new TextEncoder().encode(JSON.stringify({ title: 'Carries a stray', evidence: [] })),
          [`${EVIDENCE_PREFIX}${sha256(carried)}`]: carried,
        },
        'included',
      )

      const read = await ok(call('POST', '/api/cases/import', archive, 'application/octet-stream'), 201)
      made.push(((await read.json()) as { id: string }).id)

      expect(await holders(root, carried), 'the new case kept bytes none of its rows name').toEqual([])
    })

    describe('a figure a sent report froze', () => {
      let png = Buffer.alloc(0)
      let live = ''
      let filed = ''

      beforeAll(async () => {
        live = await opened('Sent with a figure')
        const background = { r: randomInt(256), g: randomInt(256), b: randomInt(256) }
        png = await sharp({ create: { width: 23, height: 17, channels: 3, background } }).png().toBuffer()
        const shot = await row(live, 'shot')
        await attach(live, shot, png)
        const report = await ok(call('POST', `/api/cases/${live}/reports`, { label: 'Filed' }), 201)
        filed = ((await report.json()) as { id: string }).id
        await ok(call('POST', `/api/cases/${live}/report_blocks`, { reportId: filed, kind: 'figure', position: 0, evidenceId: shot }), 201)
        const sent = await call('POST', `/api/cases/${live}/reports/${filed}/send`)
        expect(sent.ok, await sent.clone().text()).toBe(true)
        await attach(live, shot, unique('replaced the screenshot'))
      })

      const drawn = async (caseId: string, reportId: string): Promise<string[]> => {
        const docx = await ok(call('GET', `/api/cases/${caseId}/report.docx?report=${reportId}`), 200)
        const reader = new ZipReader(new Uint8ArrayReader(new Uint8Array(await docx.arrayBuffer())))
        const media = (await reader.getEntries()).filter((entry) => !entry.directory && entry.filename.startsWith('word/media/'))
        const sizes: string[] = []
        for (const entry of media) {
          if (entry.directory) continue
          const { info } = await sharp(await entry.getData(new Uint8ArrayWriter())).toBuffer({ resolveWithObject: true })
          sizes.push(`${String(info.width)}x${String(info.height)}`)
        }
        await reader.close()
        return sizes
      }

      it('is kept when its row names other bytes, and the report still draws it', async () => {
        expect(await holders(root, png)).toHaveLength(1)
        expect(await drawn(live, filed)).toEqual(['23x17'])
      })

      it('travels in an archive, and the case it is read into draws it', async () => {
        const archived = await ok(call('POST', `/api/cases/${live}/archive`, { includeFiles: true }), 200)
        const read = await ok(call('POST', '/api/cases/import', new Uint8Array(await archived.arrayBuffer()), 'application/octet-stream'), 201)
        const copy = ((await read.json()) as { id: string }).id
        made.push(copy)
        const [report] = (await (await ok(call('GET', `/api/cases/${copy}/reports`), 200)).json()) as { id: string }[]

        expect(await drawn(copy, report!.id)).toEqual(['23x17'])
      })
    })
  })

  describe('at start, beside bytes the database does not name', () => {
    const rowNotHere = unique('its row is not in this database')
    const caseNotHere = unique('its case is not in this database')
    const flat = unique('left at the top of the directory by an earlier layout')
    let second: Harness | undefined
    const said: string[] = []

    beforeAll(async () => {
      const restored = await opened('Restored from an older copy')
      const later = await row(restored, 'attached after the copy was taken')
      await attach(restored, later, rowNotHere)
      await seed.delete(evidence).where(eq(evidence.id, later))

      const absent = await opened('Not in this database')
      await attach(absent, await row(absent, 'unheld'), caseNotHere)
      await seed.delete(cases).where(eq(cases.id, absent))

      const stray = randomUUID()
      const { hash } = await suiteStore().put(stray, Readable.from([flat]))
      await rename(join(root, stray, hash), join(root, hash))
      await rmdir(join(root, stray))

      await age(root, 24)
      const warn = vi.spyOn(Logger.prototype, 'warn')
      try {
        second = await boot()
      } finally {
        said.push(...warn.mock.calls.map(([message]) => String(message)))
        warn.mockRestore()
      }
    }, 120_000)

    afterAll(async () => {
      await second?.close()
    })

    it('deletes none of them', async () => {
      expect(await holders(root, rowNotHere), 'bytes whose row the database lacks were deleted').toHaveLength(1)
      expect(await holders(root, caseNotHere), 'bytes whose case the database lacks were deleted').toHaveLength(1)
      expect(await holders(root, flat), 'bytes outside any case were deleted').toHaveLength(1)
    })

    it('says at start how many stored artefacts nothing names', () => {
      const counted = said.map((line) => /^(\d+) stored artefacts are named by no case/.exec(line)?.[1]).find(Boolean)

      expect(Number(counted ?? 0), 'the install came up without saying it holds bytes nothing names').toBeGreaterThanOrEqual(3)
    })

    it('says how many stored artefacts nothing names in its description', async () => {
      const settings = await ok(call('GET', '/api/settings'), 200)
      const { storage } = (await settings.json()) as { storage: { artefacts: { unnamed?: number } } }

      expect(storage.artefacts.unnamed, 'the install does not say it holds bytes nothing names').toBeGreaterThanOrEqual(3)
    })
  })
})
