/**
 * **A claim warns; it does not lock**, held against every write door an
 * analyst has, with the claim taken over a real socket by another analyst and
 * shown on the roster before anybody writes.
 *
 * The version check is the other half of the scenario and is asserted here
 * too: a write made against a version that moved is refused for that reason
 * alone, and the refusal names no holder.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'

import { boot, bootable, sharedAdmin, sharedAnalyst, type Harness, type Persona } from './app-harness.js'

const runnable = await bootable()

describe.skipIf(!runnable)('a row another analyst holds', () => {
  let harness: Harness
  let holder: Persona
  let writer: Persona
  let caseId = ''
  let live: WebSocket | null = null

  const call = async (who: Persona, method: string, path: string, body?: unknown) => {
    const response = await fetch(`${harness.base}${path}`, {
      method,
      headers: { cookie: who.cookie, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    return { status: response.status, body: (text ? JSON.parse(text) : {}) as Record<string, unknown> }
  }

  const aRow = async (hostname: string) => {
    const made = await call(writer, 'POST', `/api/cases/${caseId}/systems`, { hostname })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    return { id: String(made.body['id']), version: Number(made.body['version']) }
  }

  const hostnames = async () => {
    const rows = await call(writer, 'GET', `/api/cases/${caseId}/systems`)
    return (rows.body as unknown as { hostname: string }[]).map((row) => row.hostname)
  }

  /** The holder claims each row over their own socket, and the roster shows every claim. */
  async function held(ids: string[]): Promise<void> {
    const frames: string[] = []
    live = new WebSocket(`${harness.base.replace('http://', 'ws://')}/api/cases/${caseId}/live`, {
      headers: { cookie: holder.cookie, origin: harness.base },
    })
    live.on('message', (raw: Buffer) => {
      frames.push(raw.toString())
    })
    await new Promise<void>((open, fail) => {
      live!.once('open', () => {
        open()
      })
      live!.once('error', fail)
    })
    for (const id of ids) live.send(JSON.stringify({ type: 'claim', table: 'systems', id }))
    await expect
      .poll(
        () => {
          const last = frames.map((frame) => JSON.parse(frame) as { type?: string; claims?: { entry_id: string }[] })
            .filter((frame) => frame.type === 'presence')
            .at(-1)
          return ids.every((id) => last?.claims?.some((claim) => claim.entry_id === id))
        },
        { timeout: 10_000, message: 'the roster never showed the claims, so nothing below tests a held row' },
      )
      .toBe(true)
  }

  beforeAll(async () => {
    harness = await boot()
    holder = await sharedAdmin(harness)
    writer = await sharedAnalyst(harness)
    const made = await call(writer, 'POST', '/api/cases', { title: `claimed-${String(Date.now())}` })
    caseId = String(made.body['id'])
  }, 90_000)

  afterAll(async () => {
    live?.terminate()
    await harness?.close()
  })

  it('takes every write another analyst makes, judged on its version alone', async () => {
    const single = await aRow('held-single')
    const stale = await aRow('held-stale')
    const bulk = await aRow('held-bulk')
    const gone = await aRow('held-delete')
    const imported = await aRow('held-import')
    await held([single.id, stale.id, bulk.id, gone.id, imported.id])

    const patched = await call(writer, 'PATCH', `/api/cases/${caseId}/systems/${single.id}`, {
      version: single.version,
      hostname: 'held-single-written',
    })
    expect.soft(patched, 'a claim refused a write made at the current version').toMatchObject({ status: 200 })

    // The holder moves the version, as the analyst with the dialog open does on save.
    const moved = await call(holder, 'PATCH', `/api/cases/${caseId}/systems/${stale.id}`, {
      version: stale.version,
      hostname: 'held-stale-first',
    })
    expect(moved.status).toBe(200)
    const late = await call(writer, 'PATCH', `/api/cases/${caseId}/systems/${stale.id}`, {
      version: stale.version,
      hostname: 'held-stale-second',
    })
    expect.soft(late.status, 'a write against a version that moved was taken').toBe(409)
    expect.soft(late.body, 'the refusal named a holder, so the claim decided it').not.toHaveProperty('heldBy')

    const many = await call(writer, 'PATCH', `/api/cases/${caseId}/systems/bulk`, {
      ids: [{ id: bulk.id, version: bulk.version }],
      fields: { hostname: 'held-bulk-written' },
    })
    expect.soft(many.status, JSON.stringify(many.body)).toBe(200)

    const deleted = await call(writer, 'DELETE', `/api/cases/${caseId}/systems/${gone.id}?version=${String(gone.version)}`)
    expect.soft(deleted.status, JSON.stringify(deleted.body)).toBe(200)

    const replaced = await fetch(`${harness.base}/api/cases/${caseId}/systems.csv?onDuplicate=replace`, {
      method: 'POST',
      headers: { cookie: writer.cookie, 'content-type': 'text/csv' },
      body: 'hostname,system_type\nheld-import,server\n',
    })
    const answer = (await replaced.json()) as Record<string, unknown>
    expect.soft(answer, 'the import counted a held row as refused').toMatchObject({ replaced: 1, refused: 0 })

    expect(live!.readyState, 'the holder let go, so nothing above was held').toBe(WebSocket.OPEN)
    const now = await hostnames()
    expect(now).toEqual(expect.arrayContaining(['held-single-written', 'held-stale-first', 'held-bulk-written']))
    expect(now).not.toContain('held-delete')
  }, 60_000)
})
