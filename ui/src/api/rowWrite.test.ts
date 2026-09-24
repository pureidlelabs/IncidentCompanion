/**
 * One tab's writes to one record, through the real request layer to a server
 * that applies the version rule and answers after a real delay.
 */
import { QueryClient, focusManager } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { request } from './client'
import { drawn, editedAt, writeRow, writeRows } from './rowWrite'
import { setTransport } from './transport'

const LATENCY = 40

/** The JSON body a request carried, or nothing. */
const bodyOf = (init?: RequestInit) => (typeof init?.body === 'string' ? init.body : '')

let row: { version: number; title: string }
let sent: { version: number; status: number }[]

function answer(status: number, body: unknown): Promise<Response> {
  return new Promise((done) =>
    setTimeout(() => {
      done(
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
      )
    }, LATENCY),
  )
}

/** Judged on arrival, as the server judges it. */
function server(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { version, title } = JSON.parse(bodyOf(init)) as { version: number; title: string }
  if (version !== row.version) {
    sent.push({ version, status: 409 })
    return answer(409, { message: 'Someone else wrote this first.', currentVersion: row.version })
  }
  row = { version: row.version + 1, title }
  sent.push({ version, status: 200 })
  return answer(200, row)
}

function patch(client: QueryClient, read: number, title: string) {
  return writeRow(
    client,
    'case:row',
    drawn({ version: read }).version,
    (version) => request<typeof row>('/row', { method: 'PATCH', body: { version, title } }),
    (stored) => stored.version,
  )
}

beforeEach(() => {
  row = { version: 7, title: 'drawn' }
  sent = []
  setTransport(server)
})

afterEach(() => {
  focusManager.setFocused(undefined)
  setTransport((input, init) => fetch(input, init))
})

describe('one tab writing one record', () => {
  it('sends writes made before the first is answered in order, each against the one before', async () => {
    const client = new QueryClient()
    const all = [patch(client, 7, 'a'), patch(client, 7, 'ab'), patch(client, 7, 'abc')]
    await Promise.all(all)

    expect({ sent, stored: row.title }).toEqual({
      sent: [
        { version: 7, status: 200 },
        { version: 8, status: 200 },
        { version: 9, status: 200 },
      ],
      stored: 'abc',
    })
  })

  it('refuses a queued write when another analyst wrote between it and the one before', async () => {
    const client = new QueryClient()
    const first = patch(client, 7, 'mine')
    const second = patch(client, 7, 'mine again')
    await first
    // Another analyst's write, landing after this tab's first answer.
    row = { version: row.version + 1, title: 'theirs' }
    await expect(second).rejects.toMatchObject({ status: 409 })

    expect({ sent, stored: row.title }).toEqual({
      sent: [
        { version: 7, status: 200 },
        { version: 8, status: 409 },
      ],
      stored: 'theirs',
    })
  })

  it('does not hold a queued write while the tab is hidden', async () => {
    const client = new QueryClient()
    focusManager.setFocused(false)
    const both = Promise.all([patch(client, 7, 'a'), patch(client, 7, 'ab')])
    await both

    expect(sent).toEqual([
      { version: 7, status: 200 },
      { version: 8, status: 200 },
    ])
  })

  it('never lends a write a version this tab did not produce', async () => {
    const client = new QueryClient()
    await patch(client, 7, 'mine')
    // The record is read again at a version another analyst's writes reached.
    row = { version: 12, title: 'theirs' }
    await expect(patch(client, 8, 'stale')).rejects.toMatchObject({ status: 409 })

    expect(sent.at(-1)).toEqual({ version: 8, status: 409 })
  })

  it('keeps the chain moving after a refusal', async () => {
    const client = new QueryClient()
    row = { version: 9, title: 'theirs' }
    const refused = patch(client, 7, 'stale').catch(() => 'refused')
    const next = patch(client, 9, 'fresh')

    expect([await refused, (await next).title]).toEqual(['refused', 'fresh'])
  })

  it('waits for every record a request names before it leaves', async () => {
    const client = new QueryClient()
    const order: string[] = []
    const single = patch(client, 7, 'a').then(() => order.push('single'))
    const many = writeRows(
      client,
      [{ key: 'case:row', read: drawn({ version: 7 }).version }],
      (versions) => {
        order.push(`many at ${String(versions[0])}`)
        return Promise.resolve(versions)
      },
    )
    await Promise.all([single, many])

    expect(order).toEqual(['single', 'many at 8'])
  })
})

describe('the row an edit writes against', () => {
  it('is nothing for a create', () => {
    expect(editedAt(null, undefined)).toBeNull()
  })

  it('carries the version the analyst read', () => {
    expect(editedAt({ id: 'r-1' }, drawn({ version: 4 }).version)).toEqual({ id: 'r-1', version: 4 })
  })

  it('refuses an edit that arrives without a read version rather than creating a row', () => {
    expect(() => editedAt({ id: 'r-1' }, undefined)).toThrow()
  })
})
