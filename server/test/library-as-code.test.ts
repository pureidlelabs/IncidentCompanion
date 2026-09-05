/**
 * **A library, out to a file and back in.**
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'

const runnable = await bootable()

const KIND = 'templates'

interface Document {
  kind: string
  entries: { name: string; label: string; description?: string; position?: number; payload: Record<string, unknown> }[]
  disabledBuiltins?: string[]
}

describe.skipIf(!runnable)('a library as code', () => {
  let harness: Harness
  let admin: Persona

  const read = async (): Promise<Document> => {
    const answer = await fetch(`${harness.base}/api/library/${KIND}/document`, {
      headers: { cookie: admin.cookie },
    })
    expect(answer.ok, `reading the document answered ${String(answer.status)}`).toBe(true)
    return (await answer.json()) as Document
  }

  const apply = async (doc: Document): Promise<Response> =>
    fetch(`${harness.base}/api/library/${KIND}`, {
      method: 'PUT',
      headers: { cookie: admin.cookie, 'content-type': 'application/json' },
      body: JSON.stringify(doc),
    })

  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
  }, 90_000)

  afterAll(async () => {
    // Leave the library as it was found: every other suite reads it.
    await apply({ kind: KIND, entries: [], disabledBuiltins: [] })
    await harness?.close()
  })

  it('round-trips: what it serves is what it takes back', async () => {
    const before = await read()
    const applied = await apply(before)
    expect(applied.status, await applied.text()).toBe(200)

    expect(await read()).toEqual(before)
  })

  /**
   * **A built-in's content is never in the document.**
   */
  it('names no built-in among the entries', async () => {
    const doc = await read()
    const listing = await (
      await fetch(`${harness.base}/api/library/${KIND}`, { headers: { cookie: admin.cookie } })
    ).json()
    const builtins = (listing as { entries: { name: string; origin: string }[] }).entries
      .filter((entry) => entry.origin === 'built-in')
      .map((entry) => entry.name)

    expect(builtins.length, 'this install ships no built-in to test against').toBeGreaterThan(0)
    expect(doc.entries.map((entry) => entry.name)).not.toContain(builtins[0])
  })

  it('adds what the document holds', async () => {
    const doc = await read()
    const answer = await apply({
      ...doc,
      entries: [
        ...doc.entries,
        { name: 'from-git', label: 'From git', payload: { actions: [{ task: 'Do the thing' }] } },
      ],
    })
    expect(answer.status, await answer.text()).toBe(200)
    expect((await read()).entries.map((entry) => entry.name)).toContain('from-git')
  })

  /**
   * **Applying the same file twice changes nothing the second time.** A sync
   * that accumulates is a sync nobody can run from a pipeline.
   */
  it('is idempotent', async () => {
    const doc = await read()
    await apply(doc)
    const once = await read()
    await apply(doc)
    expect(await read()).toEqual(once)
  })

  /**
   * **Replace, not merge.**
   */
  it('removes an entry the document no longer names', async () => {
    const doc = await read()
    expect(doc.entries.map((entry) => entry.name)).toContain('from-git')

    await apply({ ...doc, entries: doc.entries.filter((entry) => entry.name !== 'from-git') })
    expect((await read()).entries.map((entry) => entry.name)).not.toContain('from-git')
  })

  /**
   * **A built-in is switched off, never removed.**
   */
  it('disables a built-in and takes it back', async () => {
    const listing = await (
      await fetch(`${harness.base}/api/library/${KIND}`, { headers: { cookie: admin.cookie } })
    ).json()
    const builtin = (listing as { entries: { name: string; origin: string }[] }).entries.find(
      (entry) => entry.origin === 'built-in',
    )?.name
    expect(builtin).toBeDefined()

    const doc = await read()
    await apply({ ...doc, disabledBuiltins: [builtin as string] })
    expect((await read()).disabledBuiltins).toEqual([builtin])

    await apply({ ...doc, disabledBuiltins: [] })
    expect((await read()).disabledBuiltins).toEqual([])
  })

  /**
   * **A document that names a different kind is refused.**
   */
  it('refuses a document belonging to another library', async () => {
    const doc = await read()
    const answer = await apply({ ...doc, kind: 'report-snippets' })
    expect(answer.status).toBe(422)
    expect(await answer.text()).toMatch(/report-snippets/)
  })

  /** A built-in's name may not be taken over by an entry in the document. */
  it('refuses an entry that would redefine a built-in', async () => {
    const listing = await (
      await fetch(`${harness.base}/api/library/${KIND}`, { headers: { cookie: admin.cookie } })
    ).json()
    const builtin = (listing as { entries: { name: string; origin: string }[] }).entries.find(
      (entry) => entry.origin === 'built-in',
    )?.name

    const doc = await read()
    const answer = await apply({
      ...doc,
      entries: [
        {
          name: builtin as string,
          label: 'Mine now',
          payload: { actions: [{ task: 'Take it over' }] },
        },
      ],
    })
    expect(answer.status).toBe(422)
    expect(await answer.text()).toMatch(/built in/i)
  })

  /** A payload the kind refuses is named, so an operator knows which entry. */
  it('names the entry whose payload is wrong', async () => {
    const doc = await read()
    const answer = await apply({
      ...doc,
      entries: [{ name: 'broken', label: 'Broken', payload: { actions: 'not a list' } }],
    })
    expect(answer.status).toBe(422)
    expect(await answer.text()).toMatch(/broken/)
  })

  it('refuses an unknown library rather than creating one', async () => {
    const answer = await fetch(`${harness.base}/api/library/not-a-library`, {
      method: 'PUT',
      headers: { cookie: admin.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'not-a-library', entries: [] }),
    })
    expect(answer.status).toBe(404)
  })
})
