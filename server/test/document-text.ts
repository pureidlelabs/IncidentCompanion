/** The text an exported report shows its reader, for tests that read the Word and PDF exports back. */
import { inflateSync } from 'node:zlib'

import { Uint8ArrayReader, TextWriter, ZipReader } from '@zip.js/zip.js'

/** Every text run of a `.docx`, paragraphs on their own lines. */
export async function wordText(bytes: ArrayBuffer): Promise<string> {
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
export function pdfText(bytes: ArrayBuffer): string {
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
