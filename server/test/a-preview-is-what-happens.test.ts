/**
 * **What the preview said would happen is what happened.**
 *
 * The import screen shows an analyst a verdict per candidate and lets them
 * approve a subset; the commit then writes. Those are two calls, and the
 * second re-derives everything rather than trusting what the first returned -
 * which is the right design and is exactly why the two can disagree.
 *
 * Asserted as a round trip rather than against expected counts: preview,
 * commit what it offered, preview the same payload again. The second preview
 * has to say `existing` for everything the first called `new`, because the
 * first one's promise is now the case's contents. No number in this file is
 * written down.
 *
 * **Both calls go through the app**, for the reason `incident-import.test.ts`
 * gives: the seams between the route, the schema and the service are where
 * these two came apart before.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'

const runnable = await bootable()

const entity = (kind: string, properties: Record<string, unknown>, id = kind) => ({
  kind,
  id,
  name: id,
  properties,
})

const alert = (name: string) => ({
  id: name,
  name,
  properties: {
    alertDisplayName: name,
    severity: 'High',
    tactics: ['InitialAccess'],
    timeGenerated: '2026-08-10T12:00:00Z',
  },
})

/**
 * One incident carrying a candidate of every collection the mapper writes,
 * plus a kind that maps to none.
 */
const incident = (key = 'promise-1') => ({
  key,
  title: 'A promise the preview made',
  alerts: [alert('A promise the preview made')],
  entities: [
    entity('Host', { hostName: 'WKS-9001', dnsDomain: 'corp.example' }, 'e-host'),
    entity('Account', { accountName: 'a.promise', upnSuffix: 'example.invalid' }, 'e-acct'),
    entity('Ip', { address: '198.51.100.7' }, 'e-ip'),
    entity('Malware', { name: 'Win32/Promise!rfn', category: 'Trojan' }, 'e-mal'),
    entity('CloudApplication', { appName: 'Promise Sync', instanceName: 'EU' }, 'e-app'),
    entity('Mailbox', { mailboxPrimaryAddress: 'a.promise@example.invalid' }, 'e-mbx'),
  ],
})

interface Candidate {
  id: string
  verdict: 'new' | 'existing'
  checked: boolean
}
interface Plan {
  entities: Candidate[]
  timeline: { id: string }[]
  skipped: { unsupportedKind: number; unmappable: number }
}
interface Written {
  entities: number
  timeline: number
  skippedExisting: number
}

describe.skipIf(!runnable)('a preview is what happens', () => {
  let harness: Harness
  let admin: Persona

  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
  }, 120_000)

  afterAll(async () => {
    await harness.close()
  })

  const post = (path: string, body: unknown) =>
    fetch(`${harness.base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify(body),
    })

  const newCase = async (title: string) => {
    const answer = await post('/api/cases', { title, customer: 'Promise Ltd' })
    return ((await answer.json()) as { id: string }).id
  }

  const preview = async (caseId: string, key: string): Promise<Plan> => {
    const answer = await post(`/api/cases/${caseId}/imports/preview`, {
      provider: 'sentinel',
      incidents: [incident(key)],
    })
    // 200, not 201: a preview creates nothing, and the route says so.
    expect(answer.status).toBe(200)
    return (await answer.json()) as Plan
  }

  const commit = async (caseId: string, key: string, approved: string[]): Promise<Written> => {
    const answer = await post(`/api/cases/${caseId}/imports`, {
      provider: 'sentinel',
      incidents: [incident(key)],
      approved,
      edits: [],
    })
    expect(answer.status).toBe(201)
    return (await answer.json()) as Written
  }

  it('writes exactly the candidates it called new, and no others', async () => {
    const caseId = await newCase('The preview keeps its word')
    const plan = await preview(caseId, 'promise-writes')

    // Without this the assertions below hold of an empty plan.
    expect(plan.entities.length).toBeGreaterThan(3)

    const fresh = plan.entities.filter((one) => one.verdict === 'new')
    const written = await commit(
      caseId,
      'promise-writes',
      fresh.map((one) => one.id),
    )

    expect(written.entities).toBe(fresh.length)
    expect(written.skippedExisting).toBe(0)
  }, 60_000)

  /**
   * The round trip, and the strongest form of the property: the first
   * preview's verdicts become the case's contents, so the second preview -
   * of the same payload, against the case the first one filled - has nothing
   * left to call new.
   */
  it('calls existing on a second look what it called new on the first', async () => {
    const caseId = await newCase('The second look')
    const first = await preview(caseId, 'promise-again')
    const fresh = first.entities.filter((one) => one.verdict === 'new').map((one) => one.id)
    expect(fresh.length).toBeGreaterThan(3)

    await commit(caseId, 'promise-again', fresh)
    const second = await preview(caseId, 'promise-again')

    const stillNew = second.entities.filter((one) => one.verdict === 'new').map((one) => one.id)
    expect(stillNew, 'a candidate the import wrote is offered as new again').toEqual([])

    // **And the tick follows the verdict.** A row already in the case is the
    // duplicate the analyst came to avoid, so nothing here starts approved.
    expect(second.entities.filter((one) => one.checked)).toEqual([])
  }, 60_000)

  /**
   * Approving the same set twice writes nothing the second time and says so,
   * rather than writing a second copy or reporting a silent zero.
   */
  it('accounts for every approved candidate on a repeat commit', async () => {
    const caseId = await newCase('The repeated commit')
    const first = await preview(caseId, 'promise-twice')
    const fresh = first.entities.filter((one) => one.verdict === 'new').map((one) => one.id)
    expect(fresh.length).toBeGreaterThan(3)

    await commit(caseId, 'promise-twice', fresh)
    const again = await commit(caseId, 'promise-twice', fresh)

    expect(again.entities).toBe(0)
    expect(again.skippedExisting).toBe(fresh.length)
  }, 60_000)

  /**
   * **A candidate the analyst did not approve is not written**, which is the
   * half that a preview agreeing with a commit could still get wrong by
   * writing everything.
   */
  it('writes none of what was left unapproved', async () => {
    const caseId = await newCase('The unapproved half')
    const plan = await preview(caseId, 'promise-partial')
    const fresh = plan.entities.filter((one) => one.verdict === 'new').map((one) => one.id)
    expect(fresh.length).toBeGreaterThan(3)

    const half = fresh.slice(0, 2)
    const written = await commit(caseId, 'promise-partial', half)
    expect(written.entities).toBe(half.length)

    const after = await preview(caseId, 'promise-partial')
    const stillNew = after.entities.filter((one) => one.verdict === 'new').map((one) => one.id)

    expect(stillNew.sort()).toEqual(fresh.filter((id) => !half.includes(id)).sort())
  }, 60_000)
})
