/**
 * Every spelling of an address a case record holds leaves the install unlinkable, in every format.
 *
 * Seeded through the API into a timeline entry, an indicator's context and a
 * method's recorded result, then read back from the three exports the booted
 * app serves. Each address sits under its own host, so its raw form being
 * absent is checkable by the host alone.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'
import { pdfText, wordText } from './document-text.js'

const FORMS = [
  {
    typed: 'www.w-c2.example.com/login',
    shown: 'www[.]w-c2[.]example[.]com/login',
    host: 'w-c2.example.com',
  },
  { typed: 'www.g-c2.example', shown: 'www[.]g-c2[.]example', host: 'g-c2.example' },
  {
    typed: 'http://h-c2.example.com/a',
    shown: 'hxxp://h-c2[.]example[.]com/a',
    host: 'h-c2.example.com',
  },
  {
    typed: 'ftp://f-c2.example.com/x',
    shown: 'fxp://f-c2[.]example[.]com/x',
    host: 'f-c2.example.com',
  },
  {
    typed: 'smb://s-c2.example.com/share',
    shown: 'smb[:]//s-c2[.]example[.]com/share',
    host: 's-c2.example.com',
  },
  {
    typed: '\\\\u-c2.example.com\\share',
    shown: '\\\\u-c2[.]example[.]com\\share',
    host: 'u-c2.example.com',
  },
  { typed: 'b-c2.example.net', shown: 'b-c2[.]example[.]net', host: 'b-c2.example.net' },
  { typed: 'ops@m-c2.example.org', shown: 'ops[@]m-c2[.]example[.]org', host: 'm-c2.example.org' },
  { typed: 'pl-c2.example.pl', shown: 'pl-c2[.]example[.]pl', host: 'pl-c2.example.pl' },
  { typed: 'payload.zip', shown: 'payload[.]zip', host: 'payload.zip' },
  {
    typed: 'a_b.us-c2.example.com',
    shown: 'a_b[.]us-c2[.]example[.]com',
    host: 'us-c2.example.com',
  },
  { typed: '//pr-c2.example.com/x', shown: '//pr-c2[.]example[.]com/x', host: 'pr-c2.example.com' },
  {
    typed: 'http:nc-c2.example.com',
    shown: 'hxxp:nc-c2[.]example[.]com',
    host: 'nc-c2.example.com',
  },
  {
    typed: '\\\\?\\UNC\\lp-c2.example.com\\share',
    shown: '\\\\?\\UNC\\lp-c2[.]example[.]com\\share',
    host: 'lp-c2.example.com',
  },
  // The host checked is the tail a reader links once the zero-width space splits the name.
  { typed: 'zw-c2\u200b.example.com', shown: 'zw-c2[.]example[.]com', host: 'example.com' },
  {
    typed: 'fw-c2\uff0eexample\uff0ecom',
    shown: 'fw-c2[.]example[.]com',
    host: 'fw-c2\uff0eexample',
  },
  {
    typed: 'id-c2\u3002example\u3002com',
    shown: 'id-c2[.]example[.]com',
    host: 'id-c2\u3002example',
  },
  {
    typed: 'http:\\\\bs-c2.example.com',
    shown: 'hxxp:\\\\bs-c2[.]example[.]com',
    host: 'bs-c2.example.com',
  },
]

/** Ordinary prose shaped like an address, which must arrive as typed. */
const PROSE = ['version 1.2.3', 'report.pdf', 'e.g.', 'at 16:10:00']

const SENTENCE = `${FORMS.map((form) => form.typed).join(' and ')}; ${PROSE.join(', ')}`

/** A timeline description holds 500 characters, so the sentence is split across two entries. */
const HALVES = [
  SENTENCE.slice(0, SENTENCE.indexOf(' and ', SENTENCE.length / 2)),
  SENTENCE.slice(SENTENCE.indexOf(' and ', SENTENCE.length / 2) + ' and '.length),
]

/** Markdown escapes brackets and backslashes, so every comparison is made without them. */
const plain = (text: string) => text.replaceAll('\\', '')

describe.skipIf(!(await bootable()))('a report carries no live address in any form', () => {
  let harness: Harness
  let admin: Persona
  const painted: Record<string, string> = {}

  const send = async (path: string, body: unknown) => {
    const answer = await fetch(`${harness.base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify(body),
    })
    expect(answer.status, `${path}: ${await answer.clone().text()}`).toBe(201)
    return (await answer.json()) as { id: string }
  }

  const read = async (path: string) => {
    const answer = await fetch(`${harness.base}${path}`, { headers: { cookie: admin.cookie } })
    expect(answer.status, path).toBe(200)
    return answer.arrayBuffer()
  }

  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)

    const { id: caseId } = await send('/api/cases', {
      title: 'Every spelling of an address',
      customer: 'Output Ltd',
    })
    for (const description of HALVES) {
      await send(`/api/cases/${caseId}/timeline`, {
        kind: 'event',
        time: new Date().toISOString(),
        description,
      })
    }
    await send(`/api/cases/${caseId}/network_indicators`, {
      type: 'ipv4',
      value: '198.51.100.7',
      context: SENTENCE,
    })
    await send(`/api/cases/${caseId}/methods`, {
      name: 'Proxy search',
      resultColumns: SENTENCE,
      resultExcerpt: SENTENCE,
    })
    const { id: reportId } = await send(`/api/cases/${caseId}/reports`, { label: 'Every spelling' })
    for (const kind of ['timeline', 'indicators', 'methods']) {
      await send(`/api/cases/${caseId}/report_blocks`, { reportId, kind })
    }

    const base = `/api/cases/${caseId}/report`
    painted['markdown'] = new TextDecoder().decode(await read(`${base}.md?report=${reportId}`))
    painted['word'] = await wordText(await read(`${base}.docx?report=${reportId}`))
    painted['pdf'] = pdfText(await read(`${base}.pdf?report=${reportId}`))
  }, 120_000)

  afterAll(async () => {
    await harness.close()
  })

  describe.each(['markdown', 'word', 'pdf'])('the %s export', (format) => {
    it('writes every spelling of an address defanged and none live', () => {
      const text = plain(painted[format]!)
      const seen = FORMS.map(({ typed, shown, host }) => ({
        typed,
        shown: text.includes(plain(shown)),
        live: text.includes(host),
      }))
      expect(seen).toEqual(FORMS.map(({ typed }) => ({ typed, shown: true, live: false })))
    })

    it('leaves ordinary prose shaped like an address as typed', () => {
      const text = plain(painted[format]!)
      expect(PROSE.filter((words) => !text.includes(words))).toEqual([])
    })
  })

  /**
   * GitHub-flavoured Markdown's extended autolinks, from its specification: a
   * `www.` name, an `http`, `https` or `ftp` scheme, and an email address. No
   * GFM renderer is a declared dependency, so the triggers are matched instead.
   */
  it('leaves nothing in the markdown export that GitHub-flavoured Markdown autolinks', () => {
    const triggers = /(?<![\w.-])(?:www\.|(?:https?|ftp):\/\/)\S+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gi
    expect(painted['markdown']!.match(triggers) ?? []).toEqual([])
  })
})
