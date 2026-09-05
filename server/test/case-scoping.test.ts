/**
 * **No collection read hands back a row belonging to another case.**
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, seedDemoContent, sharedAdmin, type Harness, type Persona } from './app-harness.js'

const runnable = await bootable()

interface Row {
  id?: string
}

describe.skipIf(!runnable)('reading one case', () => {
  let harness: Harness
  let admin: Persona
  let collections: string[]
  let a: string
  let b: string

  const read = async (caseId: string, collection: string): Promise<Row[] | undefined> => {
    const response = await fetch(`${harness.base}/api/cases/${caseId}/${collection}`, {
      headers: { cookie: admin.cookie },
    })
    if (!response.ok) return undefined
    const body = (await response.json()) as unknown
    return Array.isArray(body) ? (body as Row[]) : undefined
  }

  beforeAll(async () => {
    harness = await boot()
    await seedDemoContent(harness)
    admin = await sharedAdmin(harness)

    const cases = (await (
      await fetch(`${harness.base}/api/cases`, { headers: { cookie: admin.cookie } })
    ).json()) as { id: string }[]
    a = cases[0]!.id
    b = cases[1]!.id

    collections = Object.keys(
      (await (
        await fetch(`${harness.base}/api/collections`, { headers: { cookie: admin.cookie } })
      ).json()) as Record<string, unknown>,
    )
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  it('has two populated cases and a list of collections to sweep', () => {
    expect(a).not.toBe(b)
    expect(collections.length).toBeGreaterThan(5)
  })

  it('returns no row that belongs to another case', async () => {
    const leaked: string[] = []
    /**
     * Guards against the whole sweep being vacuous: if every read answered an
     * empty list - a renamed route, a scope that stopped matching - nothing
     * could overlap and this file would pass while asserting nothing.
     */
    let compared = 0

    for (const collection of collections) {
      const [rowsOfA, rowsOfB] = await Promise.all([read(a, collection), read(b, collection)])
      if (!rowsOfA?.length || !rowsOfB?.length) continue
      compared++

      const idsOfB = new Set(rowsOfB.map((row) => row.id).filter(Boolean))
      const overlap = rowsOfA.map((row) => row.id).filter((id) => id && idsOfB.has(id))
      if (overlap.length > 0) {
        leaked.push(`${collection}: ${overlap.length} row(s) of case B returned for case A`)
      }
    }

    expect(leaked).toEqual([])
    expect(compared).toBeGreaterThan(2)
  }, 120_000)
})
