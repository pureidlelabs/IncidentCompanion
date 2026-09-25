/**
 * **Every download answers with the file, whatever the file is called and
 * whatever the caller put in the query.**
 *
 * Attacked at the two ways a download turned into a 500: a stored name no
 * header could carry raw, and a report id no uuid column could compare. -> #1244,
 * #1250
 */
import { Uint8ArrayReader, Uint8ArrayWriter, ZipReader } from '@zip.js/zip.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ARTEFACT_PASSWORD } from '../src/evidence/store.js'

import { boot, bootable, seedDemoContent, sharedAdmin, type Harness, type Persona } from './app-harness.js'

const runnable = await bootable()

/** What a browser saves the file as: RFC 6266 prefers `filename*` wherever it is present. */
function savedAs(disposition: string): string {
  const extended = /filename\*=UTF-8''([^;\s]+)/.exec(disposition)
  expect(extended, `no filename* in ${disposition}`).not.toBeNull()
  // RFC 8187 attr-char, and nothing else, or a strict parser drops the parameter.
  expect(extended![1]).toMatch(/^[A-Za-z0-9!#$&+\-.^_`|~%]+$/)
  return decodeURIComponent(extended![1]!)
}

/** The fallback a client without RFC 8187 reads: one quoted, printable-ASCII value. */
function fallbackOf(disposition: string): string {
  const plain = /filename="([^"]*)"/.exec(disposition)
  expect(plain, `no filename in ${disposition}`).not.toBeNull()
  expect(disposition.match(/"/g) ?? []).toHaveLength(2)
  expect(plain![1]).toMatch(/^[\x20-\x7e]+$/)
  return plain![1]!
}

describe.skipIf(!runnable)('every download answers its caller', () => {
  let h: Harness
  let admin: Persona
  let caseId: string
  let reportId: string

  const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    fetch(`${h.base}${path}`, {
      method,
      headers: { cookie: admin.cookie, ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    })

  beforeAll(async () => {
    h = await boot()
    await seedDemoContent(h)
    admin = await sharedAdmin(h)
    const cases = (await (await call('GET', '/api/cases')).json()) as { id: string }[]
    caseId = cases[0]!.id
    const made = await call('POST', `/api/cases/${caseId}/reports`, { label: 'Downloads' })
    expect(made.status, await made.clone().text()).toBe(201)
    reportId = ((await made.json()) as { id: string }).id
  }, 90_000)

  afterAll(async () => {
    await h?.close()
  })

  /**
   * The client sends the name as `encodeURIComponent(file.name)`, so that is
   * what arrives here: a raw CR/LF could not reach the header at all.
   */
  it.each([
    ['Japanese', '請求書の写し.eml', '請求書の写し.eml.zip'],
    ['Cyrillic', 'Счёт-фактура.pdf', 'Счёт-фактура.pdf.zip'],
    ['an emoji', '📎 invoice.docm', '📎 invoice.docm.zip'],
    ['a quote and a semicolon', 'a"b;c.txt', 'a"b;c.txt.zip'],
    ['a line break carrying a header', 'x\r\nSet-Cookie: pwned=1.txt', 'xSet-Cookie: pwned=1.txt.zip'],
    ['a path climbing out', '../../etc/passwd', '.._.._etc_passwd.zip'],
  ])('downloads evidence named in %s under the name the analyst chose', async (_what, name, saved) => {
    const row = await call('POST', `/api/cases/${caseId}/evidence`, { name: 'download names' })
    expect(row.status, await row.clone().text()).toBe(201)
    const { id } = (await row.json()) as { id: string }
    const attached = await call('POST', `/api/cases/${caseId}/evidence/${id}/file`, 'the artefact', {
      'content-type': 'text/plain',
      'x-original-filename': encodeURIComponent(name),
    })
    expect(attached.status, await attached.clone().text()).toBe(200)

    const got = await call('GET', `/api/cases/${caseId}/evidence/${id}/file`)

    expect(got.status, await got.clone().text()).toBe(200)
    expect(got.headers.get('set-cookie')).toBeNull()
    const disposition = got.headers.get('content-disposition') ?? ''
    expect(disposition).toMatch(/^attachment;/)
    expect(savedAs(disposition)).toBe(saved)
    expect(fallbackOf(disposition)).not.toMatch(/[/\\]/)
    expect((await got.arrayBuffer()).byteLength).toBeGreaterThan(0)
  }, 30_000)

  it('hands evidence named outside Latin-1 back wrapped, holding the bytes as stored', async () => {
    const row = await call('POST', `/api/cases/${caseId}/evidence`, { name: 'wrapped download' })
    const { id } = (await row.json()) as { id: string }
    const bytes = `a live artefact ${String(Date.now())}`
    await call('POST', `/api/cases/${caseId}/evidence/${id}/file`, bytes, {
      'content-type': 'text/plain',
      'x-original-filename': encodeURIComponent('Письмо.eml'),
    })

    const got = await call('GET', `/api/cases/${caseId}/evidence/${id}/file`)

    expect(got.status, await got.clone().text()).toBe(200)
    expect(got.headers.get('content-type')).toBe('application/zip')
    const served = Buffer.from(await got.arrayBuffer())
    expect(served.toString('latin1')).not.toContain(bytes)
    const reader = new ZipReader(new Uint8ArrayReader(new Uint8Array(served)), { password: ARTEFACT_PASSWORD })
    const [entry] = await reader.getEntries()
    expect(entry!.filename).toBe('Письмо.eml')
    const inside = await (entry as { getData: (w: Uint8ArrayWriter) => Promise<Uint8Array> }).getData(
      new Uint8ArrayWriter(),
    )
    expect(Buffer.from(inside).toString()).toBe(bytes)
    await reader.close()
  }, 30_000)

  it.each([
    ['md', /^attachment;/],
    ['docx', /^attachment;/],
    ['pdf', /^inline;/],
  ])('serves the report as .%s under a name a browser can read', async (format, kind) => {
    const got = await call('GET', `/api/cases/${caseId}/report.${format}?report=${reportId}`)

    expect(got.status, await got.clone().text()).toBe(200)
    const disposition = got.headers.get('content-disposition') ?? ''
    expect(disposition).toMatch(kind)
    expect(savedAs(disposition)).toMatch(new RegExp(`\\.${format}$`))
    fallbackOf(disposition)
  }, 60_000)

  it('serves the case archive under a name a browser can read', async () => {
    const got = await call('POST', `/api/cases/${caseId}/archive`, { includeFiles: false })

    expect(got.status, await got.clone().text()).toBe(200)
    const disposition = got.headers.get('content-disposition') ?? ''
    expect(savedAs(disposition)).toMatch(/\.iccase$/)
    fallbackOf(disposition)
  }, 60_000)

  /**
   * **Refused before the query runs**, at the status every query schema answers
   * with, and naming the parameter: `report` is the only one of the two a
   * caller could have got wrong this way.
   */
  it.each(['md', 'docx', 'pdf'].flatMap((format) => [
    [format, 'x'],
    [format, 'not-a-uuid'],
    [format, `${'0'.repeat(8)}-0000-0000-0000-00000000000g`],
  ]))('refuses a .%s export of report %o, naming the report', async (format, report) => {
    const got = await call('GET', `/api/cases/${caseId}/report.${format}?report=${encodeURIComponent(report)}`)

    expect(got.status, await got.clone().text()).toBe(422)
    const said = (await got.json()) as { errors?: { path?: unknown[] }[] }
    expect(said.errors?.flatMap((one) => one.path ?? [])).toContain('report')
  }, 30_000)

  it.each(['md', 'docx', 'pdf'])('answers a .%s export of a report the case does not hold as not found', async (format) => {
    const got = await call('GET', `/api/cases/${caseId}/report.${format}?report=00000000-0000-4000-8000-000000000000`)

    expect(got.status).toBe(404)
  }, 30_000)
})
