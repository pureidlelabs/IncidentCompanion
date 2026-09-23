/**
 * What a case stored leaves the install when the case, or the row naming it,
 * does -- and what a sent report froze stays.
 *
 * Read from the evidence directory by content, never by layout. The start-up
 * half boots a second install over the same directory and database, which is
 * the only way to run what an install does as it comes up.
 */
import { randomBytes } from 'node:crypto'

import { ConfigService } from '@nestjs/config'
import { Uint8ArrayReader, Uint8ArrayWriter, ZipReader } from '@zip.js/zip.js'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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
import { openTestPool } from './database.js'
import { age, holders } from './evidence-on-disk.js'

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

  describe('at the next start', () => {
    const orphan = unique('its row was deleted')
    const dead = unique('its case went by a path that never told the store')
    const young = unique('its row was deleted a moment ago')
    const named = unique('still named by its row')
    let png = Buffer.alloc(0)
    let live = ''
    let filed = ''
    let second: Harness | undefined

    beforeAll(async () => {
      live = await opened('Swept at start')
      const orphanRow = await row(live, 'orphan')
      await attach(live, orphanRow, orphan)
      await ok(call('DELETE', `/api/cases/${live}/evidence/${orphanRow}?version=${String(await versionOf(live, orphanRow))}`), 200)

      const youngRow = await row(live, 'young')
      await attach(live, youngRow, young)
      await ok(call('DELETE', `/api/cases/${live}/evidence/${youngRow}?version=${String(await versionOf(live, youngRow))}`), 200)

      await attach(live, await row(live, 'named'), named)

      // A sent report's figure, whose row then names other bytes: only the frozen tree names the image.
      png = await sharp({ create: { width: 23, height: 17, channels: 3, background: { r: 201, g: 7, b: 99 } } }).png().toBuffer()
      const shot = await row(live, 'shot')
      await attach(live, shot, png)
      const report = await ok(call('POST', `/api/cases/${live}/reports`, { label: 'Filed' }), 201)
      filed = ((await report.json()) as { id: string }).id
      await ok(call('POST', `/api/cases/${live}/report_blocks`, { reportId: filed, kind: 'figure', position: 0, evidenceId: shot }), 201)
      const sent = await call('POST', `/api/cases/${live}/reports/${filed}/send`)
      expect(sent.ok, await sent.clone().text()).toBe(true)
      await attach(live, shot, unique('replaced the screenshot'))

      const gone = await opened('Removed past the store')
      await attach(gone, await row(gone, 'dead'), dead)
      await seed.delete(cases).where(eq(cases.id, gone))

      await age(root, 24, await holders(root, young))
      second = await boot()
    }, 120_000)

    afterAll(async () => {
      await second?.close()
    })

    it('removes bytes whose row was deleted', async () => {
      expect(await holders(root, orphan)).toEqual([])
    })

    it('removes bytes whose case went without telling the store', async () => {
      expect(await holders(root, dead)).toEqual([])
    })

    it('keeps bytes a row names', async () => {
      expect(await holders(root, named)).toHaveLength(1)
    })

    it('keeps bytes too new to be sure no row is about to name them', async () => {
      expect(await holders(root, young)).toHaveLength(1)
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

    it('keeps the figure a sent report froze, and the report still draws it', async () => {
      expect(await holders(root, png)).toHaveLength(1)
      expect(await drawn(live, filed)).toEqual(['23x17'])
    })

    it('carries that figure in an archive, and the case it is read into draws it', async () => {
      const archived = await ok(call('POST', `/api/cases/${live}/archive`, { includeFiles: true }), 200)
      const read = await ok(call('POST', '/api/cases/import', new Uint8Array(await archived.arrayBuffer()), 'application/octet-stream'), 201)
      const copy = ((await read.json()) as { id: string }).id
      made.push(copy)
      const [report] = (await (await ok(call('GET', `/api/cases/${copy}/reports`), 200)).json()) as { id: string }[]

      expect(await drawn(copy, report!.id)).toEqual(['23x17'])
    })
  })
})
