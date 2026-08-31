/**
 * Which separator glyphs the bundled PDF font actually draws.
 *
 * **A missing glyph is a tofu box, not an error.** pdfmake renders whatever the
 * font has and substitutes nothing, so a character the font lacks reaches the
 * customer as an empty rectangle and every automated check stays green - the
 * kill-chain `->` did exactly that. Run this and look before choosing one.
 *
 *   npx tsx scripts/glyph-probe.ts <dir>
 */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { toPdf } from '../src/report/document/pdf.js'
import type { Document } from '../src/report/document/model.js'

const CANDIDATES: [string, string][] = [
  ['U+2192 rightwards arrow', '\u2192'],
  ['U+2013 en dash', '\u2013'],
  ['U+2014 em dash', '\u2014'],
  ['U+00BB right guillemet', '\u00bb'],
  ['U+203A single right guillemet', '\u203a'],
  ['U+2022 bullet', '\u2022'],
  ['U+00B7 middle dot', '\u00b7'],
  ['ASCII greater-than', '>'],
  ['U+27A1 arrow emoji', '\u27a1'],
]

const document_: Document = {
  title: 'Glyph probe',
  tlp: '',
  language: 'en',
  languageCoverage: 1,
  sections: CANDIDATES.map(([name, glyph]) => ({
    blockId: name,
    kind: 'written',
    heading: name,
    nodes: [
      {
        type: 'richPara',
        runs: [{ text: `alpha ${glyph} bravo ${glyph} charlie`, bold: true }],
      },
    ],
  })),
}

async function main(): Promise<void> {
  const out = process.argv[2] ?? '.'
  await writeFile(join(out, 'glyph-probe.pdf'), await toPdf(document_))
  console.log('wrote glyph-probe.pdf')
}

void main()
