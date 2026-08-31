/**
 * Paint every case, so a column widened for one is checked against the rest.
 *
 * **Tuning a layout against a single document is how the next defect is made.**
 * A `Technique` column sized for `T1566.001` breaks on a longer id; a `System`
 * column that fits `WKS-FINANCE01` wraps on a longer hostname; an `Event`
 * column tuned to these sentences wraps badly on another case's. The demo cases
 * differ deliberately, so they are the cheapest corpus available.
 *
 *   DATABASE_URL=... SEED_DATABASE_URL=... npx tsx scripts/report-render-all.ts <dir>
 *
 * Writes `<title>.docx` and `<title>.pdf` per case, and prints the longest cell
 * per column - the number that says *how close to the edge* a width is, which a
 * render alone does not.
 */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import { CasesService } from '../src/cases/cases.service.js'
import { resolveReport } from '../src/report/document/resolve.js'
import { toPdf } from '../src/report/document/pdf.js'
import { toWord } from '../src/report/document/word.js'
import type { Document } from '../src/report/document/model.js'
import type { CaseData } from '../src/report/document/sections.js'
import { english } from '../src/report/document/packs.js'

const BLOCKS = [
  { id: 'h', kind: 'case_header', heading: 'Case', headingKey: '', position: 0 },
  { id: 't', kind: 'timeline', heading: 'Timeline', headingKey: '', position: 1 },
  { id: 'n', kind: 'entities', heading: 'Entities', headingKey: '', position: 2 },
  { id: 'e', kind: 'evidence', heading: 'Evidence', headingKey: '', position: 3 },
  { id: 'a', kind: 'actions', heading: 'Actions', headingKey: '', position: 4 },
  { id: 'i', kind: 'indicators', heading: 'Indicators', headingKey: '', position: 5 },
  { id: 'm', kind: 'metrics', heading: 'Metrics', headingKey: '', position: 6 },
  { id: 'r', kind: 'root_cause', heading: 'Root cause', headingKey: '', position: 7 },
  { id: 'p', kind: 'impact', heading: 'Impact', headingKey: '', position: 8 },
  { id: 'g', kind: 'glossary', heading: 'Glossary', headingKey: '', position: 9 },
  { id: 'q', kind: 'techniques', heading: 'Techniques', headingKey: '', position: 10 },
  { id: 'w', kind: 'technique_table', heading: 'Technique roll-up', headingKey: '', position: 11 },
  { id: 'b', kind: 'ribbon', heading: 'Kill chain', headingKey: '', position: 12 },
]

/**
 * The longest cell in each column, against the share of the page it has.
 *
 * **Characters per percent is the number that predicts a wrap**, and it is
 * comparable across cases where a screenshot is not. A column carrying 60
 * characters in 12% of the width will break whatever the render of one case
 * happened to show.
 */
function pressure(document_: Document): string[] {
  const lines: string[] = []
  for (const section of document_.sections) {
    for (const node of section.nodes) {
      if (node.type !== 'table') continue
      const table = node
      const longest = (table.header ?? []).map((head) => head.length)
      for (const row of table.rows) {
        row.forEach((cell, at) => {
          longest[at] = Math.max(longest[at] ?? 0, cell.text.length)
        })
      }
      const worst = longest
        .map((chars, at) => ({
          chars,
          share: table.widths[at] ?? 0,
          ratio: chars / ((table.widths[at] ?? 1) * 100),
        }))
        .sort((a, b) => b.ratio - a.ratio)[0]
      if (worst && worst.ratio > 1.6) {
        lines.push(
          `    ${section.heading || section.kind}: ${String(worst.chars)} chars in ` +
            `${String(Math.round(worst.share * 100))}% (${worst.ratio.toFixed(1)} per %)`,
        )
      }
    }
  }
  return lines
}

async function main(): Promise<void> {
  const out = process.argv[2] ?? '.'
  const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? '' })
  const db = drizzle({ client: pool })
  const cases = new CasesService(db, {
    announce: () => {},
    othersOn: () => Promise.resolve([]),
  } as never)

  for (const [at, kase] of (await cases.list()).entries()) {
    const caseData = (await cases.getWithCollections(kase.id)) as unknown as CaseData
    const document_ = resolveReport({
      title: kase.title,
      tlp: 'TLP:AMBER',
      language: 'en',
      t: english(),
      languageCoverage: 1,
      caseData,
      blocks: BLOCKS,
    })

    const stem = `case-${String(at + 1)}`
    await writeFile(join(out, `${stem}.docx`), await toWord(document_))
    await writeFile(join(out, `${stem}.pdf`), await toPdf(document_))

    const tight = pressure(document_)
    console.log(`${stem}  ${kase.title}`)
    if (tight.length) console.log(tight.join('\n'))
  }

  await pool.end()
}

void main()
