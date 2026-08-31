/**
 * Paint a real case as `.docx`, for an independent reader to open.
 *
 * **The suite reads the zip's part names; it cannot say Word will accept the
 * file.** This writes one out so `python-docx` - a different implementation
 * entirely - can open it and report what it found. A file that satisfies the
 * painter's own tests and not another library is exactly the shape of a
 * document that opens as corrupt on somebody else's machine.
 *
 *   DATABASE_URL=... npx tsx scripts/word-check.ts /tmp/report.docx
 */
import { writeFile } from 'node:fs/promises'

import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import { CasesService } from '../src/cases/cases.service.js'
import { resolveReport } from '../src/report/document/resolve.js'
import { toPdf } from '../src/report/document/pdf.js'
import { toWord } from '../src/report/document/word.js'
import type { CaseData } from '../src/report/document/sections.js'
import { english } from '../src/report/document/packs.js'

async function main(): Promise<void> {
  const out = process.argv[2] ?? '/tmp/report.docx'
  const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? '' })
  const db = drizzle({ client: pool })

  const cases = new CasesService(db, {
    announce: () => {},
    othersOn: () => Promise.resolve([]),
  } as never)

  const listed = await cases.list()
  const first = listed[0]
  if (!first) {
    console.log('no cases to paint')
  } else {
    const document_ = await cases.getWithCollections(first.id)
    const file = await toWord(
      resolveReport({
        title: first.title,
        tlp: 'TLP:AMBER',
        language: 'en',
        t: english(),
        languageCoverage: 1,
        caseData: document_ as unknown as CaseData,
        blocks: [
          { id: 'h', kind: 'case_header', heading: 'Case', headingKey: '', position: 0 },
          { id: 't', kind: 'timeline', heading: 'Timeline', headingKey: '', position: 1 },
          { id: 'n', kind: 'entities', heading: 'Entities', headingKey: '', position: 2 },
          { id: 'e', kind: 'evidence', heading: 'Evidence', headingKey: '', position: 3 },
          { id: 'a', kind: 'actions', heading: 'Actions', headingKey: '', position: 4 },
        ],
      }),
    )
    await writeFile(out, file)
    console.log(`${out}: ${String(file.length)} bytes`)

    // The same document, as the send-ready copy - so both painters can be
    // looked at side by side rather than trusted separately.
    const pdf = await toPdf(
      resolveReport({
        title: first.title,
        tlp: 'TLP:AMBER',
        language: 'en',
        t: english(),
        languageCoverage: 1,
        caseData: document_ as unknown as CaseData,
        blocks: [
          { id: 'h', kind: 'case_header', heading: 'Case', headingKey: '', position: 0 },
          { id: 't', kind: 'timeline', heading: 'Timeline', headingKey: '', position: 1 },
          { id: 'n', kind: 'entities', heading: 'Entities', headingKey: '', position: 2 },
          { id: 'e', kind: 'evidence', heading: 'Evidence', headingKey: '', position: 3 },
          { id: 'a', kind: 'actions', heading: 'Actions', headingKey: '', position: 4 },
        ],
      }),
    )
    const pdfOut = out.replace(/\.docx$/, '.pdf')
    await writeFile(pdfOut, pdf)
    console.log(`${pdfOut}: ${String(pdf.length)} bytes`)
  }

  await pool.end()
}

void main()
