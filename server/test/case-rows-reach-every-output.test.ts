/**
 * A case's rows reach every surface that publishes them.
 *
 * **The gap this closes cost three silent defects in one branch.** Renaming
 * `network_indicators.ip`/`domain` to a typed `type`/`value` left the STIX
 * bundle with **no network indicators at all**, every indicator cell in the
 * Word report blank, and every network name on the kill-chain PNG empty --
 * through 2714 server tests, 1772 client tests and a green browser tier.
 *
 * **Nothing could have caught it.** `IndicatorSources` types a row as
 * `Record<string, unknown>` and `sections.ts` re-declares its own `IndicatorRow`
 * with every field optional, so the typechecker cannot follow a rename into
 * either; and each suite's fixtures were written in the old shape, so they went
 * on describing a row that no longer existed. A reviewer found all three.
 *
 * So this asserts the one thing those modules cannot get wrong quietly: what
 * the case holds is what comes out. It reads real HTTP against a real
 * database, because the point is the whole path rather than any function in it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { defangIndicator } from '../src/report/document/defang.js'
import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'

const runnable = await bootable()

describe.skipIf(!runnable)('what a case holds reaches what it publishes', () => {
  let harness: Harness
  let admin: Persona

  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
  }, 120_000)

  afterAll(async () => {
    await harness.close()
  })

  const send = (path: string, body: unknown, method = 'POST') =>
    fetch(`${harness.base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify(body),
    })

  const read = (path: string) =>
    fetch(`${harness.base}${path}`, { headers: { cookie: admin.cookie } })

  /** Every indicator kind, so no branch of the export is left unexercised. */
  const INDICATORS = [
    { type: 'ipv4', value: '198.51.100.7', disposition: 'malicious' },
    { type: 'ipv6', value: 'fe80::1', disposition: 'malicious' },
    { type: 'domain', value: 'evil.example', disposition: 'suspicious' },
    { type: 'url', value: 'http://evil.example/a/b', disposition: 'malicious' },
  ]

  async function seeded(title: string): Promise<string> {
    const made = await send('/api/cases', { title, customer: 'Output Ltd' })
    const caseId = ((await made.json()) as { id: string }).id
    for (const row of INDICATORS) {
      const answer = await send(`/api/cases/${caseId}/network_indicators`, row)
      expect(answer.status, `seeding ${row.value}`).toBe(201)
    }
    const malware = await send(`/api/cases/${caseId}/malware`, {
      filename: 'invoice.exe',
      hash: 'd41d8cd98f00b204e9800998ecf8427e',
    })
    expect(malware.status, 'seeding malware').toBe(201)
    return caseId
  }

  it('puts every indicator the case holds into the STIX bundle', async () => {
    const caseId = await seeded('STIX carries what the case holds')
    const answer = await read(`/api/cases/${caseId}/indicators?format=stix`)
    expect(answer.status).toBe(200)
    const bundle = (await answer.json()) as { objects: { type: string; pattern?: string }[] }

    const patterns = bundle.objects.filter((one) => one.type === 'indicator')
    // **A count, not a spot check.** An empty bundle is well-formed, so
    // "it parsed" says nothing; only the arithmetic against the case does.
    expect(patterns).toHaveLength(INDICATORS.length + 1)
    for (const row of INDICATORS) {
      expect(
        patterns.some((one) => one.pattern?.includes(row.value)),
        `${row.type} ${row.value} is missing from the bundle`,
      ).toBe(true)
    }
  }, 60_000)

  it('puts every indicator the case holds into the CSV', async () => {
    const caseId = await seeded('CSV carries what the case holds')
    const answer = await read(`/api/cases/${caseId}/indicators?format=csv`)
    expect(answer.status).toBe(200)
    const csv = await answer.text()
    for (const row of INDICATORS) {
      expect(csv, `${row.value} is missing from the CSV`).toContain(row.value)
    }
  }, 60_000)

  it('prints every indicator the case holds in the rendered report', async () => {
    const caseId = await seeded('The report carries what the case holds')

    // **The generated document, not the report screen.** `report-screen`,
    // `report-columns` and `report-budget` in the browser tier all drive the
    // editor; nothing before this read what the renderer produces, which is
    // where the indicator cells were blank.
    // A report is a collection row, and the export URL names which one.
    const made = await send(`/api/cases/${caseId}/reports`, { label: 'Output' })
    expect(made.status, 'creating a report').toBe(201)
    const reportId = ((await made.json()) as { id: string }).id

    // **A report renders from its blocks, not from its template field.** A
    // report with none is a title and a subtitle, which is correct and says
    // nothing about whether the case reaches the page.
    for (const kind of ['entities', 'indicators']) {
      const block = await send(`/api/cases/${caseId}/report_blocks`, { reportId, kind })
      expect(block.status, `seeding a ${kind} block`).toBe(201)
    }

    const answer = await read(`/api/cases/${caseId}/report.md?report=${reportId}`)
    expect(answer.status).toBe(200)
    const painted = await answer.text()
    // **Defanged, and that is the document being correct.** An address ships
    // as `198[.]51[.]100[.]7` and a URL as `hxxp://`, so a reader cannot click
    // one out of a PDF -- the raw value is the wrong thing to look for, and
    // asserting it fails on right output.
    //
    // **Through the app's own function, never a rule spelled again here.** A
    // hand-written `replace(/\./g, '[.]')` passes for an address and fails for
    // a URL, which is how this test read as a defect twice before it was one.
    for (const row of INDICATORS) {
      expect(painted, `${row.value} is missing from the report`)
        .toContain(defangIndicator(row.value))
    }
    expect(painted, 'the malware hash is missing from the report').toContain('d41d8cd9')
  }, 60_000)
})
