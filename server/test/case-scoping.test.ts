/**
 * **No collection read hands back a row belonging to another case.**
 *
 * **What this covers that `db/scope.test.ts` does not.** That file proves the
 * database fails *closed*: a query which forgets to scope itself sees nothing
 * at all, rather than everything. It cannot prove a route scopes to the
 * **right** case - a handler that took the case id from the body, from a
 * session, or from the wrong parameter would set the scope deliberately, and
 * row-level security would comply. The database defends against forgetting;
 * only the route can get the answer wrong.
 *
 * **There is no membership rule to test, and that is deliberate**: any signed-in
 * analyst may open any case, because several analysts work one case at once.
 * `CaseAccessGuard` answers 404 for a case that does not exist and says in its
 * own comment that 403 would be a fact about someone else's case. So the
 * property worth asserting is not *who* may read a case - it is that reading
 * one case never returns another's rows.
 *
 * Run against the demo cases, which the suite's database already carries fully
 * populated, so the sweep needs no fixtures of its own and covers real content.
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
