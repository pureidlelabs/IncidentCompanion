/**
 * Naming an artefact's digest reaches nothing outside the case that stored it.
 *
 * Every step goes through a route the install serves. Customer B's analyst
 * attaches a mailbox export and a screenshot, places the screenshot in a report
 * and sends it; digests then reach attackers the ways the product hands them
 * out -- an insider reading the evidence list before losing reach, and a
 * handover archive written without its files.
 *
 * **Each observation is compared with a control naming a digest nobody
 * holds.** An output that differs between the two can only differ because the
 * digest resolved, so a failure here is a reach and never a fixture.
 */
import { createHash, randomBytes } from 'node:crypto'

import { Uint8ArrayReader, Uint8ArrayWriter, ZipReader } from '@zip.js/zip.js'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, signIn, type Harness, type Persona } from './app-harness.js'
import { CASE_NAME, EVIDENCE_PREFIX, MANIFEST_NAME, pack, readArchive } from '../src/archive/format.js'
import { cases } from '../src/db/schema/case.js'
import { customers } from '../src/db/schema/customer.js'
import { openTestPool } from './database.js'

const STAMP = String(Date.now())
const ISSUED = 'an-issued-password-long-enough'
const CHOSEN = 'a-chosen-password-long-enough-too'
const SECRET = Buffer.from(`customer B mailbox export ${STAMP}\n`)
const LIMITS = { memberBytes: 1e9, totalBytes: 1e9 }
const [W, H] = [41, 19]
const GREEN = `${String(W)}x${String(H)} rgb(7,201,33)`
const digestOf = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const absent = () => digestOf(randomBytes(32))

let h: Harness
let admin: Persona
const made: string[] = []
let customerB = ''

const call = (who: Persona, method: string, path: string, body?: unknown, type = 'application/json') =>
  fetch(`${h.base}${path}`, {
    method,
    headers: { cookie: who.cookie, ...(body === undefined ? {} : { 'content-type': type }) },
    body: body === undefined ? undefined : body instanceof Uint8Array ? new Uint8Array(body) : JSON.stringify(body),
  })

async function ok(answer: Promise<Response>, status: number): Promise<Response> {
  const got = await answer
  expect(got.status, await got.clone().text()).toBe(status)
  return got
}

async function analyst(name: string): Promise<Persona> {
  const email = `${name}-${STAMP}@example.test`
  await ok(call(admin, 'POST', '/api/accounts', { username: email, displayName: name, password: ISSUED, role: 'analyst' }), 201)
  const held = await signIn(h, email, ISSUED)
  await ok(call(held, 'POST', '/api/change-password', { current: ISSUED, password: CHOSEN, repeat: CHOSEN }), 200)
  return signIn(h, email, CHOSEN)
}

async function attach(who: Persona, caseId: string, name: string, bytes: Buffer, type: string) {
  const row = await ok(call(who, 'POST', `/api/cases/${caseId}/evidence`, { name }), 201)
  const { id } = (await row.json()) as { id: string }
  await ok(
    fetch(`${h.base}/api/cases/${caseId}/evidence/${id}/file`, {
      method: 'POST',
      headers: { cookie: who.cookie, 'content-type': type, 'x-original-filename': name },
      body: new Uint8Array(bytes),
    }),
    200,
  )
  return id
}

async function send(who: Persona, caseId: string, reportId: string) {
  const answer = await call(who, 'POST', `/api/cases/${caseId}/reports/${reportId}/send`)
  expect(answer.ok, await answer.clone().text()).toBe(true)
}

async function reportsOf(who: Persona, caseId: string): Promise<string[]> {
  const listed = await ok(call(who, 'GET', `/api/cases/${caseId}/reports`), 200)
  return ((await listed.json()) as { id: string }[]).map((one) => one.id)
}

async function importArchive(who: Persona, archive: Uint8Array): Promise<string> {
  const answer = await ok(call(who, 'POST', '/api/cases/import', archive, 'application/octet-stream'), 201)
  const { id } = (await answer.json()) as { id: string }
  made.push(id)
  return id
}

/** An archive naming two digests from evidence rows, with a draft report placing the second. */
function naming(text: string, png: string): Promise<Buffer> {
  const [e1, e2, r, b] = [1, 2, 3, 4].map((n) => `0000000${String(n)}-0000-4000-8000-00000000000${String(n)}`)
  const record = {
    title: `names digests ${STAMP}`,
    evidence: [
      { id: e1, name: 'mail', hash: text, originalFilename: 'mail.eml' },
      { id: e2, name: 'shot', hash: png, originalFilename: 'shot.png' },
    ],
    reports: [{ id: r, label: 'Draft', language: 'en' }],
    reportBlocks: [{ id: b, reportId: r, kind: 'figure', position: 0, evidenceId: e2 }],
  }
  return pack({ [CASE_NAME]: new TextEncoder().encode(JSON.stringify(record)) }, 'omitted')
}

/** The same archive with every occurrence of each digest replaced. */
async function retargeted(archive: Uint8Array, swaps: ReadonlyMap<string, string>): Promise<Buffer> {
  const { members, attachments, missing } = await readArchive(Buffer.from(archive), LIMITS)
  const { [MANIFEST_NAME]: _manifest, ...carried } = members
  let text = Buffer.from(carried[CASE_NAME]!).toString('utf8')
  for (const [from, to] of swaps) text = text.replaceAll(from, to)
  return pack({ ...carried, [CASE_NAME]: new TextEncoder().encode(text) }, attachments, missing)
}

async function mediaOf(docx: ArrayBuffer): Promise<string[]> {
  const reader = new ZipReader(new Uint8ArrayReader(new Uint8Array(docx)))
  const found: string[] = []
  for (const entry of await reader.getEntries()) {
    if (entry.directory || !entry.filename.startsWith('word/media/')) continue
    const bytes = await entry.getData(new Uint8ArrayWriter())
    const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true })
    found.push(`${String(info.width)}x${String(info.height)} rgb(${String(data[0])},${String(data[1])},${String(data[2])})`)
  }
  await reader.close()
  return found
}

/** Everything a case yields that a digest could reach: its archive, and each report as three outputs. */
interface Seen {
  artefacts: Buffer[]
  omitted: string | null
  reports: { docx: string[]; pdfImages: number; ruler: unknown }[]
}

async function observe(who: Persona, caseId: string): Promise<Seen> {
  const archived = await ok(call(who, 'POST', `/api/cases/${caseId}/archive`, { includeFiles: true }), 200)
  const { members } = await readArchive(Buffer.from(await archived.arrayBuffer()), LIMITS)
  const artefacts = Object.entries(members)
    .filter(([name]) => name.startsWith(EVIDENCE_PREFIX))
    .map(([, bytes]) => Buffer.from(bytes))

  const reports: Seen['reports'] = []
  for (const id of await reportsOf(who, caseId)) {
    const docx = await ok(call(who, 'GET', `/api/cases/${caseId}/report.docx?report=${id}`), 200)
    const pdf = await ok(call(who, 'GET', `/api/cases/${caseId}/report.pdf?report=${id}`), 200)
    const ruler = await ok(call(who, 'GET', `/api/cases/${caseId}/reports/${id}/page-ruler`), 200)
    reports.push({
      docx: await mediaOf(await docx.arrayBuffer()),
      pdfImages: Buffer.from(await pdf.arrayBuffer()).toString('latin1').split('/Subtype /Image').length - 1,
      ruler: await ruler.json(),
    })
  }
  return { artefacts, omitted: archived.headers.get('x-archive-omitted'), reports }
}

/** What an observation shows of customer B's two artefacts, by name. */
function leaked(seen: Seen, png: Buffer): string[] {
  const out: string[] = []
  if (seen.artefacts.some((one) => one.equals(SECRET))) out.push('the mailbox export, in the archive')
  if (seen.artefacts.some((one) => one.equals(png))) out.push('the screenshot, in the archive')
  seen.reports.forEach((one, n) => {
    if (one.docx.includes(GREEN)) out.push(`the screenshot, in report ${String(n)}'s docx`)
    if (one.pdfImages > 0) out.push(`an image, in report ${String(n)}'s pdf`)
  })
  return out
}

describe.skipIf(!(await bootable()))('an artefact is reached only through the case that holds it', () => {
  let victim: Persona
  let insider: Persona
  let outsider: Persona
  let caseB = ''
  let text = ''
  let png = Buffer.alloc(0)
  let pngDigest = ''
  let handover = new Uint8Array()

  beforeAll(async () => {
    h = await boot()
    admin = await sharedAdmin(h)
    victim = await analyst('holder')
    insider = await analyst('insider')
    outsider = await analyst('outsider')

    const customer = await ok(call(admin, 'POST', '/api/customers', { name: `Customer B ${STAMP}` }), 201)
    customerB = ((await customer.json()) as { id: string }).id
    const group = await ok(call(admin, 'POST', '/api/groups', { name: `B team ${STAMP}` }), 201)
    const groupId = ((await group.json()) as { id: string }).id
    await ok(call(admin, 'POST', `/api/groups/${groupId}/customers`, { customerId: customerB }), 200)
    await ok(call(admin, 'POST', `/api/groups/${groupId}/members`, { userId: victim.id, level: 'delete' }), 200)
    await ok(call(admin, 'POST', `/api/groups/${groupId}/members`, { userId: insider.id, level: 'read' }), 200)

    const opened = await ok(call(victim, 'POST', '/api/cases', { title: `B incident ${STAMP}` }), 201)
    caseB = ((await opened.json()) as { id: string }).id
    made.push(caseB)
    await ok(call(victim, 'PUT', `/api/cases/${caseB}/customer`, { customerId: customerB }), 200)

    png = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 7, g: 201, b: 33 } } })
      .png()
      .toBuffer()
    await attach(victim, caseB, 'ceo.eml', SECRET, 'message/rfc822')
    const shot = await attach(victim, caseB, 'console.png', png, 'image/png')

    // A sent report whose frozen tree names the screenshot's digest.
    const report = await ok(call(victim, 'POST', `/api/cases/${caseB}/reports`, { label: 'Filed' }), 201)
    const reportId = ((await report.json()) as { id: string }).id
    await ok(call(victim, 'POST', `/api/cases/${caseB}/report_blocks`, { reportId, kind: 'figure', position: 0, evidenceId: shot }), 201)
    await send(victim, caseB, reportId)
    handover = new Uint8Array(await (await ok(call(victim, 'POST', `/api/cases/${caseB}/archive`, { includeFiles: false }), 200)).arrayBuffer())

    // The insider learns the digests while they may, through the ordinary read.
    const rows = (await (await ok(call(insider, 'GET', `/api/cases/${caseB}/evidence`), 200)).json()) as { name: string; hash: string }[]
    text = rows.find((one) => one.name === 'ceo.eml')!.hash
    pngDigest = rows.find((one) => one.name === 'console.png')!.hash
    expect(text).toBe(digestOf(SECRET))
    expect(pngDigest).toBe(digestOf(png))

    await ok(call(admin, 'DELETE', `/api/groups/${groupId}/members/${insider.id}`), 200)
  }, 180_000)

  afterAll(async () => {
    const pool = openTestPool(process.env['SEED_DATABASE_URL'] ?? process.env['DATABASE_URL']!, 'ic_seed')
    const db = drizzle({ client: pool })
    for (const id of made) await db.delete(cases).where(eq(cases.id, id))
    if (customerB) await db.delete(customers).where(eq(customers.id, customerB)).catch(() => undefined)
    await pool.end()
    await h?.close()
  })

  /** Without this, every "leaked nothing" below could be a detector that sees nothing. */
  it('shows the holder their own artefacts in every output the others are checked in', async () => {
    const own = await observe(victim, caseB)
    expect(leaked(own, png).sort()).toEqual([
      "an image, in report 0's pdf",
      'the mailbox export, in the archive',
      "the screenshot, in report 0's docx",
      'the screenshot, in the archive',
    ])
  }, 60_000)

  it('refuses the insider and the outsider the case itself', async () => {
    await ok(call(insider, 'GET', `/api/cases/${caseB}`), 404)
    await ok(call(outsider, 'GET', `/api/cases/${caseB}`), 404)
  })

  /**
   * Draft and sent: a draft report's figure is read at render, and sending it
   * freezes whatever that render placed. Both are observed.
   */
  async function throughRowsAndReport(who: Persona, one: string, two: string) {
    const caseId = await importArchive(who, await naming(one, two))
    const draft = await observe(who, caseId)
    const [reportId] = await reportsOf(who, caseId)
    await send(who, caseId, reportId!)
    return { draft, sent: await observe(who, caseId) }
  }

  it.each([
    ['an account that reaches nothing of customer B', () => outsider],
    ['an analyst whose reach to it was withdrawn', () => insider],
  ])('serves %s none of it by naming its digests', async (_, who) => {
    const named = await throughRowsAndReport(who(), text, pngDigest)
    const control = await throughRowsAndReport(who(), absent(), absent())

    expect(leaked(named.draft, png)).toEqual([])
    expect(leaked(named.sent, png)).toEqual([])
    expect(named, 'an output differs between a digest customer B holds and one nobody does').toEqual(control)
  }, 90_000)

  it('gives a stranger re-reading a handover none of what it withheld', async () => {
    const reread = await observe(outsider, await importArchive(outsider, handover))
    const control = await observe(
      outsider,
      await importArchive(outsider, await retargeted(handover, new Map([[text, absent()], [pngDigest, absent()]]))),
    )

    expect(reread.reports, 'the handover carried no sent report, so the frozen figure went untried').toHaveLength(1)
    expect(leaked(reread, png)).toEqual([])
    expect(reread).toEqual(control)
    expect(reread.omitted, 'the re-export says this install lost files it was never given').toBe('0')
  }, 90_000)

  it('writes an upload of the same bytes into the uploader\u2019s own case, under their own name', async () => {
    const opened = await ok(call(outsider, 'POST', '/api/cases', { title: `same bytes ${STAMP}` }), 201)
    const mine = ((await opened.json()) as { id: string }).id
    made.push(mine)
    const row = await attach(outsider, mine, 'mine.eml', SECRET, 'message/rfc822')

    const got = await ok(call(outsider, 'GET', `/api/cases/${mine}/evidence/${row}/file`), 200)
    const reader = new ZipReader(new Uint8ArrayReader(new Uint8Array(await got.arrayBuffer())))
    const names = (await reader.getEntries()).map((entry) => entry.filename)
    await reader.close()
    expect(names, 'the download names the file as the first case to hold these bytes called it').toEqual(['mine.eml'])
  }, 60_000)
})
