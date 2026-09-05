/**
 * Both doors an incident comes through, driven through the app.
 *
 * **Through the app rather than the service**, because the defects this
 * replaces were all at seams a direct call cannot see: a route that was never
 * mounted, a body the schema refused, an id mapped by position across six
 * requests. A service call proves the mapping; only a request proves the
 * import.
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

const alert = (name: string, properties: Record<string, unknown> = {}) => ({
  id: name,
  name,
  properties: {
    alertDisplayName: name,
    severity: 'High',
    tactics: ['InitialAccess'],
    timeGenerated: '2026-08-10T12:00:00Z',
    ...properties,
  },
})

/** One incident carrying every kind the mapper reads. */
const incident = (key = 'inc-1') => ({
  key,
  title: 'Impossible travel sign-in',
  alerts: [alert('Impossible travel sign-in')],
  entities: [
    entity('Host', { hostName: 'WKS-0142', dnsDomain: 'corp.example', osFamily: 'Windows' }, 'e-host'),
    entity('Account', { accountName: 'k.varga', upnSuffix: 'example.invalid' }, 'e-acct'),
    entity('Ip', { address: '203.0.113.9', location: { countryName: 'Netherlands' } }, 'e-ip'),
    entity('Malware', { name: 'Win32/Toga!rfn', category: 'Trojan' }, 'e-mal'),
    entity('CloudApplication', { appName: 'Ledger Sync', instanceName: 'EU' }, 'e-app'),
    // A kind with no home in a case: counted, not silently dropped.
    entity('Mailbox', { mailboxPrimaryAddress: 'k.varga@example.invalid' }, 'e-mbx'),
  ],
})

describe.skipIf(!runnable)('importing an incident', () => {
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
    const answer = await post('/api/cases', { title, customer: 'Import Ltd' })
    return ((await answer.json()) as { id: string }).id
  }

  describe('the door inside a case', () => {
    it('previews without writing anything', async () => {
      const caseId = await newCase('Preview writes nothing')
      const answer = await post(`/api/cases/${caseId}/imports/preview`, {
        provider: 'sentinel',
        incidents: [incident()],
      })
      expect(answer.status).toBe(200)
      const plan = (await answer.json()) as {
        entities: { collection: string; verdict: string; label: string }[]
        timeline: unknown[]
        skipped: { unsupportedKind: number }
      }

      expect(plan.entities.map((one) => one.collection).sort()).toEqual([
        'accounts',
        'cloud_apps',
        'malware',
        'network_indicators',
        'systems',
      ])
      expect(plan.timeline).toHaveLength(1)
      expect(plan.skipped.unsupportedKind, 'the mailbox').toBe(1)
      expect(plan.entities.every((one) => one.verdict === 'new')).toBe(true)

      const after = await fetch(`${harness.base}/api/cases/${caseId}/systems`, {
        headers: { cookie: admin.cookie },
      })
      expect(((await after.json()) as unknown[]).length, 'a preview must not write').toBe(0)
    }, 60_000)

    it('writes what was approved, and links the timeline to it', async () => {
      const caseId = await newCase('Commit writes')
      const plan = (await (
        await post(`/api/cases/${caseId}/imports/preview`, {
          provider: 'sentinel',
          incidents: [incident()],
        })
      ).json()) as { entities: { id: string }[]; timeline: { id: string }[] }

      const answer = await post(`/api/cases/${caseId}/imports`, {
        provider: 'sentinel',
        incidents: [incident()],
        approved: [...plan.entities.map((one) => one.id), ...plan.timeline.map((one) => one.id)],
        edits: [],
      })
      expect(answer.status).toBe(201)
      expect(await answer.json()).toMatchObject({ entities: 5, timeline: 1 })

      const systems = (await (
        await fetch(`${harness.base}/api/cases/${caseId}/systems`, {
          headers: { cookie: admin.cookie },
        })
      ).json()) as { id: string; hostname: string }[]
      expect(systems.map((one) => one.hostname)).toEqual(['WKS-0142'])

      const timeline = (await (
        await fetch(`${harness.base}/api/cases/${caseId}/timeline`, {
          headers: { cookie: admin.cookie },
        })
      ).json()) as { systemId: string | null; provenance: string; unreviewed: boolean }[]
      expect(timeline[0]?.systemId, 'the entry names the host that was just written').toBe(
        systems[0]?.id,
      )
      expect(timeline[0]?.provenance, 'the server stamps this, never the caller').toBe('imported')
      expect(timeline[0]?.unreviewed).toBe(true)
    }, 60_000)

    /**
     * **The verdict comes from the database, not from what the client fetched.**
     */
    it('sees on a second pass what the first pass wrote', async () => {
      const caseId = await newCase('Dedup against the database')
      const first = (await (
        await post(`/api/cases/${caseId}/imports/preview`, {
          provider: 'sentinel',
          incidents: [incident()],
        })
      ).json()) as { entities: { id: string }[] }

      await post(`/api/cases/${caseId}/imports`, {
        provider: 'sentinel',
        incidents: [incident()],
        approved: first.entities.map((one) => one.id),
        edits: [],
      })

      const second = (await (
        await post(`/api/cases/${caseId}/imports/preview`, {
          provider: 'sentinel',
          incidents: [incident()],
        })
      ).json()) as { entities: { verdict: string; existing: string | null; checked: boolean }[] }

      expect(second.entities.every((one) => one.verdict === 'existing')).toBe(true)
      expect(second.entities.every((one) => one.existing !== null)).toBe(true)
      expect(second.entities.some((one) => one.checked), 'an existing row starts unticked').toBe(
        false,
      )
    }, 60_000)

    /**
     * **A URL and a DNS resolution for one host are two indicators**, and the
     * re-import still recognises both.
     */
    it('writes an indicator each for a host arriving as a URL and a resolution', async () => {
      const caseId = await newCase('One host, two kinds')
      const both = {
        ...incident(),
        entities: [
          entity('Url', { url: 'https://evil.example.invalid/login' }, 'e-url'),
          entity('DnsResolution', { domainName: 'evil.example.invalid' }, 'e-dns'),
        ],
      }
      const plan = (await (
        await post(`/api/cases/${caseId}/imports/preview`, { provider: 'sentinel', incidents: [both] })
      ).json()) as { entities: { id: string; label: string }[] }
      expect(plan.entities, 'a URL and a host are two observables').toHaveLength(2)

      await post(`/api/cases/${caseId}/imports`, {
        provider: 'sentinel',
        incidents: [both],
        approved: plan.entities.map((one) => one.id),
        edits: [],
      })

      // And the same payload a day later is not a second row.
      const again = (await (
        await post(`/api/cases/${caseId}/imports/preview`, { provider: 'sentinel', incidents: [both] })
      ).json()) as { entities: { verdict: string }[] }
      expect(again.entities.every((one) => one.verdict === 'existing')).toBe(true)

      const rows = (await (
        await fetch(`${harness.base}/api/cases/${caseId}/network_indicators`, {
          headers: { cookie: admin.cookie },
        })
      ).json()) as { type: string; value: string }[]
      expect(rows.map((one) => `${one.type}:${one.value}`).sort()).toEqual([
        'domain:evil.example.invalid',
        'url:https://evil.example.invalid/login',
      ])
    }, 60_000)

    /**
     * **A defanged URL is ordinary, and must not take the import with it.**
     */
    it('imports a URL written without a scheme', async () => {
      const caseId = await newCase('Defanged URL')
      const bare = {
        ...incident(),
        entities: [entity('Url', { url: 'www.evil.example.invalid/login' }, 'e-bare')],
      }
      const plan = (await (
        await post(`/api/cases/${caseId}/imports/preview`, { provider: 'sentinel', incidents: [bare] })
      ).json()) as { entities: { id: string; checked: boolean }[]; timeline: { id: string }[] }

      const answer = await post(`/api/cases/${caseId}/imports`, {
        provider: 'sentinel',
        incidents: [bare],
        approved: [...plan.entities.map((one) => one.id), ...plan.timeline.map((one) => one.id)],
        edits: [],
      })
      expect(answer.status, 'the analyst accepted the defaults and it was refused').toBe(201)

      const rows = (await (
        await fetch(`${harness.base}/api/cases/${caseId}/network_indicators`, {
          headers: { cookie: admin.cookie },
        })
      ).json()) as { type: string; value: string }[]
      // Whole, including the path a host-only column had to throw away.
      expect(rows.map((one) => one.value)).toEqual(['www.evil.example.invalid/login'])
    }, 60_000)

    it('refuses a timeline edit the single-entry door would refuse', async () => {
      const caseId = await newCase('Timeline edits are validated')
      const plan = (await (
        await post(`/api/cases/${caseId}/imports/preview`, {
          provider: 'sentinel',
          incidents: [incident()],
        })
      ).json()) as { timeline: { id: string }[] }
      const entry = plan.timeline[0]!

      const answer = await post(`/api/cases/${caseId}/imports`, {
        provider: 'sentinel',
        incidents: [incident()],
        approved: [entry.id],
        edits: [{ id: entry.id, field: 'severity', value: 'Critical' }],
      })
      expect(answer.status).toBe(422)

      const timeline = await fetch(`${harness.base}/api/cases/${caseId}/timeline`, {
        headers: { cookie: admin.cookie },
      })
      expect(timeline.status, 'the collection still renders').toBe(200)
    }, 60_000)

    /** An edit is a named field on a named candidate, validated like any write. */
    it('applies an edit, and refuses one the collection would refuse', async () => {
      const caseId = await newCase('Edits are validated')
      const plan = (await (
        await post(`/api/cases/${caseId}/imports/preview`, {
          provider: 'sentinel',
          incidents: [incident()],
        })
      ).json()) as { entities: { id: string; collection: string }[] }
      const host = plan.entities.find((one) => one.collection === 'systems')!

      const good = await post(`/api/cases/${caseId}/imports`, {
        provider: 'sentinel',
        incidents: [incident()],
        approved: [host.id],
        edits: [{ id: host.id, field: 'hostname', value: 'CORRECTED-01' }],
      })
      expect(good.status).toBe(201)

      const systems = (await (
        await fetch(`${harness.base}/api/cases/${caseId}/systems`, {
          headers: { cookie: admin.cookie },
        })
      ).json()) as { hostname: string }[]
      expect(systems.map((one) => one.hostname)).toEqual(['CORRECTED-01'])

      const bad = await post(`/api/cases/${caseId}/imports`, {
        provider: 'sentinel',
        incidents: [incident('inc-2')],
        approved: [host.id.replace('inc-1', 'inc-2')],
        edits: [{ id: host.id.replace('inc-1', 'inc-2'), field: 'verdict', value: 'not-a-verdict' }],
      })
      expect(bad.status, 'an edit is a write and the schema decides').toBe(422)
    }, 60_000)

    /**
     * **All or nothing across collections.**
     */
    it('writes nothing at all when one row in the batch is refused', async () => {
      const caseId = await newCase('One transaction')
      const plan = (await (
        await post(`/api/cases/${caseId}/imports/preview`, {
          provider: 'sentinel',
          incidents: [incident()],
        })
      ).json()) as { entities: { id: string; collection: string }[] }
      const app = plan.entities.find((one) => one.collection === 'cloud_apps')!

      const answer = await post(`/api/cases/${caseId}/imports`, {
        provider: 'sentinel',
        incidents: [incident()],
        approved: plan.entities.map((one) => one.id),
        // `appName` is required, and an empty one refuses the cloud_apps group
        // -- which is written after systems, accounts and indicators.
        edits: [{ id: app.id, field: 'appName', value: '' }],
      })
      expect(answer.status).toBe(422)

      for (const collection of ['systems', 'accounts', 'network_indicators']) {
        const rows = (await (
          await fetch(`${harness.base}/api/cases/${caseId}/${collection}`, {
            headers: { cookie: admin.cookie },
          })
        ).json()) as unknown[]
        expect(rows, `${collection} was written before the refusal`).toHaveLength(0)
      }
    }, 60_000)
  })

  describe('the door that starts a case', () => {
    it('previews an incident with no case to compare against', async () => {
      const answer = await post('/api/imports/preview', {
        provider: 'sentinel',
        incidents: [incident()],
      })
      expect(answer.status).toBe(200)
      const plan = (await answer.json()) as { entities: { verdict: string }[] }
      expect(plan.entities.length).toBe(5)
      expect(plan.entities.every((one) => one.verdict === 'new')).toBe(true)
    }, 60_000)

    it('creates the case and fills it in one call', async () => {
      const plan = (await (
        await post('/api/imports/preview', { provider: 'sentinel', incidents: [incident()] })
      ).json()) as { entities: { id: string }[]; timeline: { id: string }[] }

      const answer = await post('/api/imports/case', {
        provider: 'sentinel',
        incidents: [incident()],
        approved: [...plan.entities.map((one) => one.id), ...plan.timeline.map((one) => one.id)],
        edits: [],
        title: 'Started from Sentinel',
        customer: 'Import Ltd',
        // Seeded by the wizard from the incident, and correctable there.
        reference: '4471',
        severity: 'high',
        // **The offset spelling the control actually writes.** `DateTimeInput`
        // joins its halves with `+00:00`; a test that only ever sent `Z` let a
        // schema through that refused every real submission.
        detectedAt: '2026-07-30T08:55:00+00:00',
      })
      expect(answer.status).toBe(201)
      const started = (await answer.json()) as { caseId: string; entities: number; timeline: number }
      expect(started.entities).toBe(5)
      expect(started.timeline).toBe(1)

      const kase = (await (
        await fetch(`${harness.base}/api/cases/${started.caseId}`, {
          headers: { cookie: admin.cookie },
        })
      ).json()) as {
        title: string
        reference: string | null
        severity: string | null
        detectedAt: string | null
      }
      expect(kase.title).toBe('Started from Sentinel')

      /**
       * **What the incident already knew has to survive the create.**
       */
      expect(kase.reference).toBe('4471')
      expect(kase.severity).toBe('high')
      expect(kase.detectedAt).not.toBeNull()
    }, 60_000)
  })
})
