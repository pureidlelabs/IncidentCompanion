/**
 * Resolve and paint a real case, as a script rather than a test.
 *
 * **A fixture cannot catch a column name that does not exist**, because the
 * test builds its rows in the shape the resolver expects. This reads a demo
 * case out of the database, so the shape is the server's own.
 *
 *   DATABASE_URL=... npx tsx scripts/report-live-check.ts
 *
 * Outside `src/` because it crosses a boundary the layering rule refuses
 * inside the tree. Needs seeded demo content, which `./test.sh` does not
 * promise; run it by hand when a resolver lands.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import { CasesService } from '../src/cases/cases.service.js'
import { toMarkdown } from '../src/report/document/markdown.js'
import { resolveReport } from '../src/report/document/resolve.js'
import type { CaseData } from '../src/report/document/sections.js'
import { english } from '../src/report/document/packs.js'

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? '' })
  const db = drizzle({ client: pool })

  const cases = new CasesService(db, {
    announce: () => {},
    othersOn: () => Promise.resolve([]),
  } as never)

  const listed = await cases.list()
  const first = listed[0]
  if (!first) {
    console.log('no cases to check against')
  } else {
    const document_ = await cases.getWithCollections(first.id)
    const painted = toMarkdown(
      resolveReport({
        title: first.title,
        tlp: '',
        language: process.env.REPORT_LANG ?? 'en',
        t: english(),
        languageCoverage: 1,
        caseData: document_ as unknown as CaseData,
        blocks: [
          { id: 'h', kind: 'case_header', heading: 'Case', headingKey: '', position: 0 },
          { id: 't', kind: 'timeline', heading: 'Timeline', headingKey: '', position: 1 },
          { id: 'e', kind: 'evidence', heading: 'Evidence', headingKey: '', position: 2 },
          { id: 'a', kind: 'actions', heading: 'Actions', headingKey: '', position: 3 },
          { id: 'x', kind: 'exec_card', heading: 'Summary', headingKey: '', position: 4 },
          { id: 'k', kind: 'killchain', heading: 'Kill chain', headingKey: '', position: 5 },
          { id: 'n', kind: 'narrative', heading: 'Narrative', headingKey: '', position: 6 },
        ],
      }),
    )
    console.log(painted)
  }

  await pool.end()
}

void main()
