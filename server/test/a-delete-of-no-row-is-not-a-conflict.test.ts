/**
 * A single-row delete naming no row in this case is refused as not there, the
 * same way whether the id names nothing or a row of another case; only a row
 * that is here at another version is refused as somebody having written first.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAnalyst, type Harness, type Persona } from './app-harness.js'

const STAMP = String(Date.now())
const ABSENT = '00000000-0000-4000-8000-000000000000'

const COLLECTIONS = [
  {
    name: 'timeline',
    body: () => ({ kind: 'event', time: new Date().toISOString(), description: `deleted ${STAMP}` }),
    change: { description: `changed ${STAMP}` },
  },
  {
    name: 'systems',
    body: () => ({ hostname: `deleted-${STAMP}-${String(Math.random())}` }),
    change: { hostname: `changed-${STAMP}-${String(Math.random())}` },
  },
] as const

describe.skipIf(!(await bootable()))('a single-row delete', () => {
  let harness: Harness
  let analyst: Persona
  let here = ''
  let elsewhere = ''

  const call = async (method: string, path: string, body?: unknown) => {
    const response = await fetch(`${harness.base}${path}`, {
      method,
      headers: { cookie: analyst.cookie, 'content-type': 'application/json', origin: harness.origin },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    return { status: response.status, text: await response.text() }
  }

  const aCase = async (title: string) => {
    const made = await call('POST', '/api/cases', { title })
    expect(made.status, made.text).toBe(201)
    return String((JSON.parse(made.text) as { id: string }).id)
  }

  const aRow = async (caseId: string, collection: (typeof COLLECTIONS)[number]) => {
    const made = await call('POST', `/api/cases/${caseId}/${collection.name}`, collection.body())
    expect(made.status, made.text).toBe(201)
    const row = JSON.parse(made.text) as { id: string; version: number }
    return { id: row.id, version: row.version }
  }

  const remove = (caseId: string, collection: string, id: string, version: number) =>
    call('DELETE', `/api/cases/${caseId}/${collection}/${id}?version=${String(version)}`)

  beforeAll(async () => {
    harness = await boot()
    analyst = await sharedAnalyst(harness)
    here = await aCase(`Delete here ${STAMP}`)
    elsewhere = await aCase(`Delete elsewhere ${STAMP}`)
  }, 120_000)

  afterAll(async () => {
    await harness?.close()
  })

  it('answers not there for an id no row has and for a row of another case, alike', async () => {
    for (const collection of COLLECTIONS) {
      const theirs = await aRow(elsewhere, collection)

      const absent = await remove(here, collection.name, ABSENT, 1)
      const other = await remove(here, collection.name, theirs.id, theirs.version)

      expect(absent.status, `${collection.name}: ${absent.text}`).toBe(404)
      expect(other.status, `${collection.name}: ${other.text}`).toBe(404)
      expect(other.text.replace(theirs.id, '{id}'), `${collection.name}: the two refusals can be told apart`).toBe(
        absent.text.replace(ABSENT, '{id}'),
      )

      const still = await call('GET', `/api/cases/${elsewhere}/${collection.name}/${theirs.id}`)
      expect(still.status, `${collection.name}: a delete aimed at another case removed its row`).toBe(200)
    }
  })

  it('answers somebody wrote first for a row changed since it was read, naming the version it holds', async () => {
    for (const collection of COLLECTIONS) {
      const read = await aRow(here, collection)
      const changed = await call('PATCH', `/api/cases/${here}/${collection.name}/${read.id}`, {
        version: read.version,
        ...collection.change,
      })
      expect(changed.status, `${collection.name}: ${changed.text}`).toBe(200)
      const holds = (JSON.parse(changed.text) as { version: number }).version

      const stale = await remove(here, collection.name, read.id, read.version)

      expect(stale.status, `${collection.name}: ${stale.text}`).toBe(409)
      expect(JSON.parse(stale.text)).toMatchObject({ message: 'Someone else wrote this first.', currentVersion: holds })
      expect((await remove(here, collection.name, read.id, holds)).status, collection.name).toBe(200)
    }
  })
})
