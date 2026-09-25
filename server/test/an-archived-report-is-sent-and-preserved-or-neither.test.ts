/**
 * A report is sent and preserved, or neither, whoever writes it; and a document
 * an archive preserves is checked and contained on the way in.
 *
 * Each forged archive starts from a genuine send and export and edits only the
 * report's lifecycle, so a refusal can only be about that.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { eq, inArray, sql } from 'drizzle-orm'
import * as encoding from 'lib0/encoding'
import { writeUpdate } from 'y-protocols/sync'
import * as Y from 'yjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAnalyst, type Harness, type Persona } from './app-harness.js'
import { as } from './acting.js'
import { openTestPool } from './database.js'
import { pdfText, wordText } from './document-text.js'
import { cases } from '../src/db/schema/case.js'
import { reports } from '../src/db/schema/report.js'
import { ProseService, reportDocument } from '../src/prose/prose.service.js'
import { fragmentFor } from '../src/domain/prose-fields.js'
import { CASE_NAME, MANIFEST_NAME, pack, readArchive } from '../src/archive/format.js'

const STAMP = String(Date.now())
const LIVE = 'https://evil.example/login'
/** An address in the analyst's own written prose, and a method's saved query. */
const WRITTEN = 'https://written-c2.example.com/a'
const QUERY = 'curl https://query-c2.example.com/a'
const LIMITS = { memberBytes: 64 * 1024 * 1024, totalBytes: 128 * 1024 * 1024 }

describe.skipIf(!(await bootable()))('a report an archive says was sent', () => {
  let harness: Harness
  let analyst: Persona
  const pool = openTestPool(process.env['SEED_DATABASE_URL'] ?? process.env['DATABASE_URL']!, 'ic_seed')
  const seed = drizzle({ client: pool })
  const made: string[] = []
  let members: Record<string, Uint8Array> = {}
  let sentReport = ''
  let filed = ''

  async function call(method: string, path: string, body?: unknown, type = 'application/json') {
    return fetch(`${harness.base}${path}`, {
      method,
      headers: { cookie: analyst.cookie, 'content-type': type, origin: harness.origin },
      ...(body === undefined ? {} : { body: type === 'application/json' ? JSON.stringify(body) : (body as BodyInit) }),
    })
  }

  async function json<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await call(method, path, body)
    const text = await response.text()
    expect(response.status, `${method} ${path}: ${text}`).toBeLessThan(300)
    return JSON.parse(text) as T
  }

  /** The genuine archive with its one report's record rewritten by `edit`, under a title of its own. */
  async function forged(title: string, edit: (report: Record<string, unknown>) => void): Promise<Uint8Array> {
    const record = JSON.parse(new TextDecoder().decode(members[CASE_NAME])) as {
      title: string
      reports: Record<string, unknown>[]
    }
    record.title = title
    edit(record.reports[0]!)
    const rest = Object.fromEntries(Object.entries(members).filter(([name]) => name !== MANIFEST_NAME))
    rest[CASE_NAME] = new TextEncoder().encode(JSON.stringify(record))
    return pack(rest, 'omitted', [])
  }

  /** Each export of a report, as its reader sees the text, with Markdown's escaping backslashes removed. */
  async function exported(caseId: string, reportId: string): Promise<Record<string, string>> {
    const read = async (format: string) => {
      const answer = await call('GET', `/api/cases/${caseId}/report.${format}?report=${reportId}`)
      expect(answer.status, format).toBe(200)
      return answer.arrayBuffer()
    }
    return {
      markdown: new TextDecoder().decode(await read('md')).replaceAll('\\', ''),
      word: (await wordText(await read('docx'))).replaceAll('\\', ''),
      pdf: pdfText(await read('pdf')).replaceAll('\\', ''),
    }
  }

  const importing = (archive: Uint8Array) =>
    call('POST', '/api/cases/import', new Uint8Array(archive), 'application/octet-stream')

  const titled = async (title: string) =>
    seed.select({ id: cases.id }).from(cases).where(eq(cases.title, title))

  beforeAll(async () => {
    harness = await boot()
    analyst = await sharedAnalyst(harness)
    const caseId = (await json<{ id: string }>('POST', '/api/cases', { title: `Filed ${STAMP}` })).id
    made.push(caseId)
    filed = caseId
    sentReport = (await json<{ id: string }>('POST', `/api/cases/${caseId}/reports`, { label: `Seen at ${LIVE}` })).id
    const block = await json<{ id: string }>('POST', `/api/cases/${caseId}/report_blocks`, {
      reportId: sentReport,
      kind: 'written',
      position: 0,
    })
    const prose = as(analyst.id, harness.app.get(ProseService, { strict: false }))
    const address = reportDocument(sentReport)
    // Sent as the analyst's editor sends it, so the save names them and stores it.
    const client = new Y.Doc()
    Y.applyUpdate(client, Y.encodeStateAsUpdate(await prose.open(caseId, address)))
    const before = Y.encodeStateVector(client)
    const paragraph = new Y.XmlElement('paragraph')
    paragraph.insert(0, [new Y.XmlText(`The phishing page is named in the title, and served from ${WRITTEN}.`)])
    fragmentFor(client, block.id).insert(0, [paragraph])
    const encoder = encoding.createEncoder()
    writeUpdate(encoder, Y.encodeStateAsUpdate(client, before))
    await prose.apply(caseId, address, encoding.toUint8Array(encoder), 'a-socket', { id: analyst.id, label: 'A', headers: {} })
    await prose.flush(caseId, address)
    await prose.release(caseId, address)
    await json('POST', `/api/cases/${caseId}/methods`, { name: 'Proxy search', query: QUERY })
    await json('POST', `/api/cases/${caseId}/report_blocks`, { reportId: sentReport, kind: 'methods', position: 1 })
    await json('POST', `/api/cases/${caseId}/reports/${sentReport}/send`)

    const out = await call('POST', `/api/cases/${caseId}/archive`, { includeFiles: false })
    members = (await readArchive(Buffer.from(await out.arrayBuffer()), LIMITS)).members
  }, 120_000)

  afterAll(async () => {
    const extra = await seed.select({ id: cases.id }).from(cases).where(sql`${cases.title} like ${`%${STAMP}`}`)
    const ids = [...new Set([...made, ...extra.map((row) => row.id)])]
    if (ids.length > 0) await seed.delete(cases).where(inArray(cases.id, ids))
    await pool.end()
    await harness?.close()
  })

  it.each([
    ['preserves a document no painter reads', (report: Record<string, unknown>) => (report.frozen = { nonsense: true })],
    ['preserves a document and was never sent', (report: Record<string, unknown>) => (report.sentAt = null)],
    [
      'says it was sent and preserves nothing',
      (report: Record<string, unknown>) => {
        report.frozen = null
        report.frozenAt = null
      },
    ],
  ])('refuses a report that %s, and leaves no case behind', async (what, edit) => {
    const title = `${what} ${STAMP}`
    const answer = await importing(await forged(title, edit))
    const body = (await answer.json()) as { message?: string }

    expect({ status: answer.status, names: body.message?.includes('reports'), left: (await titled(title)).length }).toEqual({
      status: 422,
      names: true,
      left: 0,
    })
  })

  it('reads a genuine sent report as sent', async () => {
    const title = `Genuine ${STAMP}`
    const answer = await importing(await forged(title, () => undefined))
    expect(answer.status, await answer.clone().text()).toBe(201)
    const { id } = (await answer.json()) as { id: string }
    const [report] = await json<{ sentAt: string | null }[]>('GET', `/api/cases/${id}/reports`)

    expect(report?.sentAt).toEqual(expect.any(String))
  })

  it('contains a live indicator an archive preserved, on the way in', async () => {
    const title = `Live indicator ${STAMP}`
    const archive = await forged(title, (report) => {
      report.frozen = JSON.parse(
        JSON.stringify(report.frozen).replaceAll('hxxps://evil[.]example/login', LIVE),
      ) as unknown
    })
    const answer = await importing(archive)
    expect(answer.status, await answer.clone().text()).toBe(201)
    const { id } = (await answer.json()) as { id: string }
    const [report] = await seed.select({ id: reports.id }).from(reports).where(eq(reports.caseId, id))

    // Markdown escapes the brackets a defanged address carries.
    const markdown = (await (await call('GET', `/api/cases/${id}/report.md?report=${report!.id}`)).text()).replaceAll('\\', '')
    expect({ live: markdown.includes(LIVE), contained: markdown.includes('hxxps://evil[.]example/login') }).toEqual({
      live: false,
      contained: true,
    })
  })

  /** Each a part an archive can claim is exempt from the rule, holding an address of its own. */
  it.each([
    ['a link on a generated run', 'run-c2', (host: string) => ({
      blockId: 'forged', kind: 'timeline', heading: '',
      nodes: [{ type: 'richPara', runs: [{ text: 'see here', url: `https://${host}.example.com/a` }] }],
    })],
    ['a section it says the analyst wrote', 'written-c2', (host: string) => ({
      blockId: 'forged', kind: 'written', heading: '',
      nodes: [{ type: 'richPara', runs: [{ text: `fetched https://${host}.example.com/a` }] }],
    })],
    ['a code block it says is verbatim', 'verbatim-c2', (host: string) => ({
      blockId: 'forged', kind: 'methods', heading: '',
      nodes: [{ type: 'code', lines: [`curl https://${host}.example.com/a`], verbatim: true }],
    })],
  ])('contains %s, on the way in', async (_what, host, section) => {
    const archive = await forged(`Forged ${host} ${STAMP}`, (report) => {
      ;(report.frozen as { sections: unknown[] }).sections.push(section(host))
    })
    const answer = await importing(archive)
    expect(answer.status, await answer.clone().text()).toBe(201)
    const { id } = (await answer.json()) as { id: string }
    const [report] = await seed.select({ id: reports.id }).from(reports).where(eq(reports.caseId, id))

    const formats = await exported(id, report!.id)
    expect(
      Object.entries(formats).map(([format, text]) => ({
        format,
        live: text.includes(`${host}.example.com`),
        contained: text.includes(`hxxps://${host}[.]example[.]com/a`),
      })),
    ).toEqual(Object.keys(formats).map((format) => ({ format, live: false, contained: true })))
  })

  it('stores a genuine preserved report as it arrived, and exports it with no live address', async () => {
    const archive = await forged(`Round trip ${STAMP}`, () => undefined)
    const sent = (JSON.parse(new TextDecoder().decode(members[CASE_NAME])) as { reports: { frozen: unknown }[] })
      .reports[0]!.frozen
    const answer = await importing(archive)
    expect(answer.status, await answer.clone().text()).toBe(201)
    const { id } = (await answer.json()) as { id: string }
    const [report] = await seed
      .select({ id: reports.id, frozen: reports.frozen })
      .from(reports)
      .where(eq(reports.caseId, id))

    expect({ identical: report!.frozen, query: JSON.stringify(report!.frozen).includes(QUERY) }).toEqual({
      identical: sent,
      query: true,
    })
    const formats = await exported(id, report!.id)
    expect(
      Object.entries(formats).map(([format, text]) => ({
        format,
        live: ['written-c2.example.com', 'query-c2.example.com', 'evil.example/login'].filter((host) => text.includes(host)),
        written: text.includes('hxxps://written-c2[.]example[.]com/a'),
        query: text.includes('hxxps://query-c2[.]example[.]com/a'),
      })),
    ).toEqual(Object.keys(formats).map((format) => ({ format, live: [], written: true, query: true })))
  })

  it("keeps the analyst's written address and a saved query as written in a report sent here", async () => {
    const formats = await exported(filed, sentReport)
    expect(
      Object.entries(formats).map(([format, text]) => ({ format, written: text.includes(WRITTEN), query: text.includes(QUERY) })),
    ).toEqual(Object.keys(formats).map((format) => ({ format, written: true, query: true })))
  })

  it.each([
    ['preserves a document on a draft', sql`update reports set frozen = '{}'::jsonb, frozen_at = now() where id = `],
    ['stamps a report sent that preserves nothing', sql`update reports set sent_at = now() where id = `],
    ['dates a preservation that holds nothing', sql`update reports set frozen_at = now() where id = `],
  ])('refuses any writer that %s', async (_what, statement) => {
    const caseId = made[0]!
    const [draft] = await seed
      .insert(reports)
      .values({ caseId, label: `Draft ${STAMP}` })
      .returning({ id: reports.id })
    const refused = await seed
      .execute(sql`${statement}${draft!.id}`)
      .then(() => 'written')
      .catch((error: { cause?: { code?: string } }) => error.cause?.code ?? 'other')

    expect(refused).toBe('23514')
  })
})
