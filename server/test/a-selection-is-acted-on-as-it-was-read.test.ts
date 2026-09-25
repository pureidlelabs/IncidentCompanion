/** A selection is acted on as it was read, through the bulk doors. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, sharedAnalyst, type Harness, type Persona } from './app-harness.js'

const STAMP = String(Date.now())

describe.skipIf(!(await bootable()))('a selection another analyst changes before it is confirmed', () => {
  let harness: Harness
  let selector: Persona
  let other: Persona
  let caseId = ''

  const call = async (who: Persona, method: string, path: string, body?: unknown) => {
    const response = await fetch(`${harness.base}/api/cases/${caseId}${path}`, {
      method,
      headers: { cookie: who.cookie, 'content-type': 'application/json', origin: harness.origin },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const text = await response.text()
    return { status: response.status, body: (text ? JSON.parse(text) : {}) as Record<string, unknown> }
  }

  /** Two rows read by the selector, the second then changed by the other analyst. */
  async function selected(tag: string) {
    const rows: { id: string; version: number }[] = []
    for (const which of ['kept', 'changed']) {
      const made = await call(selector, 'POST', '/systems', { hostname: `${which}-${tag}-${STAMP}` })
      expect(made.status, JSON.stringify(made.body)).toBe(201)
      rows.push({ id: String(made.body['id']), version: Number(made.body['version']) })
    }
    const [kept, changed] = rows as [(typeof rows)[0], (typeof rows)[0]]
    const theirs = await call(other, 'PATCH', `/systems/${changed.id}`, { version: changed.version, verdict: 'suspected' })
    expect(theirs.status, JSON.stringify(theirs.body)).toBe(200)
    return { kept, changed }
  }

  const verdictOf = async (id: string) => {
    const read = await call(selector, 'GET', `/systems/${id}`)
    return read.status === 200 ? read.body['verdict'] : `gone (${String(read.status)})`
  }

  beforeAll(async () => {
    harness = await boot()
    selector = await sharedAnalyst(harness)
    other = await sharedAdmin(harness)
    const made = await fetch(`${harness.base}/api/cases`, {
      method: 'POST',
      headers: { cookie: selector.cookie, 'content-type': 'application/json', origin: harness.origin },
      body: JSON.stringify({ title: `Selection ${STAMP}` }),
    })
    caseId = ((await made.json()) as { id: string }).id
  }, 120_000)

  afterAll(async () => {
    await harness?.close()
  })

  it('deletes none of a selection holding a row that changed, and names that row', async () => {
    const { kept, changed } = await selected('delete')

    const answer = await call(selector, 'POST', '/bulk-delete', { targets: [{ collection: 'systems', rows: [kept, changed] }] })

    expect({
      status: answer.status,
      refused: answer.body['refused'],
      left: [await verdictOf(kept.id), await verdictOf(changed.id)],
    }).toEqual({ status: 409, refused: [changed.id], left: ['unknown', 'suspected'] })
  })

  it('writes over none of a row that changed, and names that row', async () => {
    const { kept, changed } = await selected('change')

    const answer = await call(selector, 'PATCH', '/systems/bulk', { ids: [kept, changed], fields: { verdict: 'compromised' } })

    expect({
      status: answer.status,
      refused: answer.body['refused'],
      left: [await verdictOf(kept.id), await verdictOf(changed.id)],
    }).toEqual({ status: 200, refused: [changed.id], left: ['compromised', 'suspected'] })
  })
})
