/**
 * What does a real report cost - in bytes, in a flush, and to render?
 *
 * **Nothing stressed this tier, and three of its decisions are only defensible
 * with numbers.** The document is `gc: false`, so it keeps every edit ever made
 * rather than the current text; it is re-encoded whole on every flush; and one
 * document holds every section of the report, so the cost is the *report's*,
 * not a section's. Each of those is a deliberate choice, and each has a size at
 * which it stops being a good one.
 *
 *   DATABASE_URL=... SEED_DATABASE_URL=... npx tsx scripts/prose-stress.ts
 *
 * Reports the shape of the growth rather than passing or failing: the number
 * worth knowing is where the curve goes, and a threshold invented here would be
 * a guess wearing an assertion's clothes.
 */
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as Y from 'yjs'

import { CasesService } from '../src/cases/cases.service.js'
import { ProseService, reportDocument } from '../src/prose/prose.service.js'
import { resolveReport } from '../src/report/document/resolve.js'
import { toMarkdown } from '../src/report/document/markdown.js'
import { reportBlocks, reports } from '../src/db/schema/report.js'
import { english } from '../src/report/document/packs.js'

/**
 * A report of this many written sections. Nine is typical; the default here is
 * a long one, and `SECTIONS=...` in the environment goes further.
 */
const SECTIONS = Number(process.env.SECTIONS ?? 40)

/** Edit rounds per section - a paragraph typed, revised, and partly deleted. */
const ROUNDS = Number(process.env.ROUNDS ?? 60)

/**
 * Rewrite the section rather than appending to it.
 *
 * **This is the profile that costs.** Appending grows the document by roughly
 * what was typed; *rewriting* the same paragraph over and over grows it by
 * every version, because `gc: false` keeps what was deleted. An analyst
 * redrafting a summary twenty times is the ordinary case, not the pathological
 * one.
 */
const REWRITE = process.env.REWRITE === '1'

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`
const ms = (start: number) => `${(performance.now() - start).toFixed(0)} ms`

async function anAnalyst(db: ReturnType<typeof drizzle>): Promise<string> {
  const answered = await db.execute<{ id: string }>(sql`select id from "user" limit 1`)
  const id = answered.rows[0]?.id
  if (!id) throw new Error('no account exists to raise a case as')
  return id
}

/**
 * One editing round on one section: type a sentence, then delete part of an
 * earlier one.
 *
 * **The deletion is the point.** With `gc: false` a delete does not shrink the
 * document - it records that the text was removed and keeps what it was, which
 * is what makes point-in-time restore possible and what makes the growth curve
 * worth measuring.
 */
function edit(doc: Y.Doc, blockId: string, round: number): void {
  const fragment = doc.getXmlFragment(blockId)
  doc.transact(() => {
    const para = new Y.XmlElement('paragraph')
    const text = new Y.XmlText()
    text.insert(
      0,
      `Round ${String(round)}: the account was used from 203.0.113.47 and the ` +
        'session was terminated by the responder shortly afterwards.',
    )
    para.insert(0, [text])
    fragment.insert(fragment.length, [para])

    if (REWRITE) {
      // Everything before this round goes, which is the redraft.
      if (fragment.length > 1) fragment.delete(0, fragment.length - 1)
    } else if (fragment.length > 3) {
      const earlier = fragment.get(1)
      if (earlier instanceof Y.XmlElement) {
        const inner = earlier.get(0)
        if (inner instanceof Y.XmlText && inner.length > 20) inner.delete(0, 20)
      }
    }
  })
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? '' })
  const db = drizzle({ client: pool })
  const seedPool = new Pool({
    connectionString: process.env.SEED_DATABASE_URL ?? process.env.DATABASE_URL ?? '',
  })
  const seed = drizzle({ client: seedPool })

  const actorId = await anAnalyst(seed)
  const cases = new CasesService(db, {
    announce: () => {},
    othersOn: () => Promise.resolve([]),
  } as never)
  const kase = await cases.create({ title: 'Prose under stress' }, actorId)
  const [report] = await seed
    .insert(reports)
    .values({ caseId: kase.id, label: 'Stress', createdBy: actorId })
    .returning()

  const blocks = []
  for (let at = 0; at < SECTIONS; at += 1) {
    const [row] = await seed
      .insert(reportBlocks)
      .values({
        caseId: kase.id,
        reportId: report!.id,
        kind: 'written',
        heading: `Section ${String(at + 1)}`,
        position: at,
        createdBy: actorId,
      })
      .returning()
    blocks.push(row!)
  }

  const prose = new ProseService(db)
  const doc = await prose.open(kase.id, reportDocument(report!.id))

  console.log(
    `${String(SECTIONS)} sections, ${String(ROUNDS)} rounds each, ` +
      `${REWRITE ? 'rewriting' : 'appending'}\n`,
  )
  console.log(`${'after'.padEnd(14)}${'document'.padStart(10)}${'flush'.padStart(9)}`)

  const typing = performance.now()
  for (let round = 1; round <= ROUNDS; round += 1) {
    for (const block of blocks) edit(doc, block.id, round)

    if (round % 20 === 0 || round === 1) {
      const size = Y.encodeStateAsUpdate(doc).byteLength
      const flushing = performance.now()
      await prose.flush(kase.id, reportDocument(report!.id))
      console.log(
        `${`round ${String(round)}`.padEnd(14)}${kb(size).padStart(10)}${ms(flushing).padStart(9)}`,
      )
    }
  }
  console.log(`\ntyping, all rounds applied in memory: ${ms(typing)}`)

  // What a cold reader pays: the row, decoded, and the fragments walked.
  await prose.release(kase.id, reportDocument(report!.id))
  const reopening = performance.now()
  const reopened = await prose.open(kase.id, reportDocument(report!.id))
  console.log(`reopen from the row: ${ms(reopening)}`)

  const rendering = performance.now()
  const painted = toMarkdown(
    resolveReport({
      title: 'Prose under stress',
      tlp: 'TLP:AMBER',
      language: 'en',
      t: english(),
      languageCoverage: 1,
      prose: reopened,
      blocks: blocks.map((row) => ({
        id: row.id,
        kind: row.kind,
        heading: row.heading,
        headingKey: row.headingKey,
        position: row.position,
      })),
    }),
  )
  console.log(`resolve and paint: ${ms(rendering)}, ${kb(Buffer.byteLength(painted))} of markdown`)

  const live = Y.encodeStateAsUpdate(reopened).byteLength
  const text = blocks.reduce(
    (total, row) => total + reopened.getXmlFragment(row.id).toJSON().length,
    0,
  )
  console.log(`\ndocument ${kb(live)} for ${kb(text)} of current text \u2014 ${(live / text).toFixed(1)}x`)

  await prose.release(kase.id, reportDocument(report!.id))
  await pool.end()
  await seedPool.end()
}

void main()
