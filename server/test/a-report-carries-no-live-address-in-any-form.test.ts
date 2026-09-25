/**
 * Every spelling of an address a case record holds leaves the install unlinkable, in every format.
 *
 * Seeded through the API into a timeline entry, an indicator's context and a
 * method's recorded result, then read back from the three exports the booted
 * app serves. Each address sits under its own host, so its raw form being
 * absent is checkable by the host alone.
 */
import { inflateSync } from 'node:zlib'

import { Uint8ArrayReader, TextWriter, ZipReader } from '@zip.js/zip.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'

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
]

/** Ordinary prose shaped like an address, which must arrive as typed. */
const PROSE = ['version 1.2.3', 'report.pdf', 'e.g.', 'payload.zip', 'setup.py', 'at 16:10:00']

const SENTENCE = `${FORMS.map((form) => form.typed).join(' and ')}; ${PROSE.join(', ')}`

/** Markdown escapes brackets and backslashes, so every comparison is made without them. */
const plain = (text: string) => text.replaceAll('\\', '')

async function wordText(bytes: ArrayBuffer): Promise<string> {
  const reader = new ZipReader(new Uint8ArrayReader(new Uint8Array(bytes)))
  let text = ''
  for (const entry of await reader.getEntries()) {
    if (entry.directory || !entry.filename.endsWith('.xml')) continue
    const xml = await entry.getData(new TextWriter())
    text += xml.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '') + '\n'
  }
  await reader.close()
  return text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')
}

/**
 * The text a PDF's pages draw, decoded through each font's `ToUnicode` map.
 *
 * Handles the shape the PDF painter writes and nothing more: flate or plain
 * streams, `/Fn size Tf`, and hex strings of two-byte glyph ids in `Tj`/`TJ`.
 */
function pdfText(bytes: ArrayBuffer): string {
  const raw = Buffer.from(bytes).toString('latin1')
  const objects = new Map<string, { dict: string; stream: string | null }>()
  for (const [, id, body] of raw.matchAll(/(\d+) 0 obj([\s\S]*?)endobj/g)) {
    const at = body!.indexOf('stream')
    if (at === -1) {
      objects.set(id!, { dict: body!, stream: null })
      continue
    }
    const dict = body!.slice(0, at)
    const data = Buffer.from(
      body!.slice(at + 'stream'.length, body!.lastIndexOf('endstream')).replace(/^\r?\n/, ''),
      'latin1',
    )
    let stream: string
    try {
      stream = dict.includes('/FlateDecode')
        ? inflateSync(data).toString('latin1')
        : data.toString('latin1')
    } catch {
      stream = ''
    }
    objects.set(id!, { dict, stream })
  }

  const unicode = (hex: string) => Buffer.from(hex, 'hex').swap16().toString('utf16le')
  const maps = new Map<string, Map<number, string>>()
  for (const [id, { dict }] of objects) {
    const ref = /\/ToUnicode (\d+) 0 R/.exec(dict)?.[1]
    const cmap = ref ? objects.get(ref)?.stream : null
    if (!cmap) continue
    const map = new Map<number, string>()
    for (const [, lo, hi, list] of cmap.matchAll(/<([0-9a-f]+)> <([0-9a-f]+)> \[([^\]]*)\]/gi)) {
      const targets = [...list!.matchAll(/<([0-9a-f ]+)>/gi)].map((one) =>
        unicode(one[1]!.replaceAll(' ', '')),
      )
      for (let code = parseInt(lo!, 16); code <= parseInt(hi!, 16); code++) {
        map.set(code, targets[code - parseInt(lo!, 16)] ?? '')
      }
    }
    for (const [, code, target] of cmap.matchAll(/^<([0-9a-f]+)> <([0-9a-f]+)>$/gim))
      map.set(parseInt(code!, 16), unicode(target!))
    maps.set(id, map)
  }
  const fonts = new Map<string, Map<number, string>>()
  for (const { dict } of objects.values()) {
    for (const [, name, ref] of dict.matchAll(/\/(F\d+) (\d+) 0 R/g)) {
      const map = maps.get(ref!)
      if (map) fonts.set(name!, map)
    }
  }

  let text = ''
  for (const { stream } of objects.values()) {
    if (!stream?.includes(' Tf')) continue
    let font: Map<number, string> | undefined
    for (const [op] of stream.matchAll(/\/F\d+ [\d.]+ Tf|\[[^\]]*\] TJ|<[0-9a-f]*> Tj/gi)) {
      if (op.endsWith('Tf')) font = fonts.get(op.slice(1, op.indexOf(' ')))
      else {
        for (const [, hex] of op.matchAll(/<([0-9a-f]*)>/gi)) {
          for (let at = 0; at < hex!.length; at += 4)
            text += font?.get(parseInt(hex!.slice(at, at + 4), 16)) ?? ''
        }
      }
    }
  }
  return text
}

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
    await send(`/api/cases/${caseId}/timeline`, {
      kind: 'event',
      time: new Date().toISOString(),
      description: SENTENCE,
    })
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
