/**
 * A figure through the render service, which is where its size is decided.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CasesService } from '../cases/cases.service.js'
import { CollectionService } from '../collections/collection.service.js'
import { REPORT_BLOCKS_COLLECTION } from '../collections/entities.controller.js'
import { cases, evidence, reportBlocks, reports, user } from '../db/schema/index.js'
import { EvidenceStore } from '../evidence/store.js'
import { ProseService } from '../prose/prose.service.js'
import { ReportRenderService } from './render.service.js'
import { english } from './document/packs.js'
import { openTestPool } from '../../test/database.js'
import type { FigureNode } from './document/model.js'

const URL_ = process.env.DATABASE_URL
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null
const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

const englishOnly = {
  translatorFor: () => Promise.resolve(english()),
  coverageOf: () => Promise.resolve(1),
} as never

const root = mkdtempSync(join(tmpdir(), 'ic-figure-render-'))

describe.skipIf(!db)('placing a figure', () => {
  let render: ReportRenderService
  let collections: CollectionService
  let store: EvidenceStore
  let caseId: string
  let actorId: string

  afterAll(async () => {
    rmSync(root, { recursive: true, force: true })
    await pool?.end()
    if (seedPool !== pool) await seedPool?.end()
  })

  beforeAll(async () => {
    store = new EvidenceStore({
      get: () => root,
    } as unknown as ConstructorParameters<typeof EvidenceStore>[0])

    const now = new Date()
    actorId = crypto.randomUUID()
    await seed!.insert(user).values({
      id: actorId,
      name: 'Figure Placement Analyst',
      email: `figure-placement-${String(Date.now())}@example.test`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    const [row] = await seed!
      .insert(cases)
      .values({ title: 'Figure placement', createdBy: actorId })
      .returning()
    caseId = row!.id

    collections = new CollectionService(db!)
    render = new ReportRenderService(
      db!,
      new CasesService(db!),
      new ProseService(db!),
      englishOnly,
      store,
    )
  }, 60_000)

  /** A 400x300 artefact in the store, and the evidence row that names it. */
  async function placedFigure(format: 'png' | 'webp'): Promise<string> {
    const { default: sharp } = await import('sharp')
    const bytes = await sharp({
      create: { width: 400, height: 300, channels: 3, background: '#4f46e5' },
    })
      // A computed method on its own line, which reads as indexing the object
      // above it. Kept split because the one-line form is worse to read; the
      // semicolon-free style is what makes it ambiguous at all.
      // eslint-disable-next-line no-unexpected-multiline
      [format]()
      .toBuffer()
    const stored = await store.put(Readable.from([bytes]) as never, `shot.${format}`)

    const [row] = await seed!
      .insert(evidence)
      .values({ caseId, name: `shot.${format}`, hash: stored.hash, createdBy: actorId })
      .returning()

    const [report] = await seed!
      .insert(reports)
      .values({ caseId, label: 'With a figure', language: 'en', createdBy: actorId })
      .returning()
    await seed!.insert(reportBlocks).values({
      caseId,
      reportId: report!.id,
      kind: 'figure',
      position: 0,
      evidenceId: row!.id,
      createdBy: actorId,
    })
    return report!.id
  }

  const figureIn = (document_: { sections: { nodes: unknown[] }[] }): FigureNode =>
    document_.sections
      .flatMap((one) => one.nodes)
      .find((one): one is FigureNode => (one as FigureNode).type === 'figure')!

  /**
   * **The route the client writes through, which nothing exercised.**
   */
  it('stores an evidence choice written through the collection route', async () => {
    const { default: sharp } = await import('sharp')
    const bytes = await sharp({
      create: { width: 400, height: 300, channels: 3, background: '#4f46e5' },
    })
      .png()
      .toBuffer()
    const stored = await store.put(Readable.from([bytes]) as never, 'picked.png')
    const [row] = await seed!
      .insert(evidence)
      .values({ caseId, name: 'picked.png', hash: stored.hash, createdBy: actorId })
      .returning()
    const [report] = await seed!
      .insert(reports)
      .values({ caseId, label: 'Picked', language: 'en', createdBy: actorId })
      .returning()

    const created = (await collections.create(
      REPORT_BLOCKS_COLLECTION,
      caseId,
      { reportId: report!.id, kind: 'figure', position: 0, evidenceId: row!.id },
      actorId,
    )) as Record<string, unknown>

    expect(created['evidenceId'], 'the route dropped the choice').toBe(row!.id)

    // And it draws: the round trip is only worth anything if the resolver reads
    // what the route stored.
    const { document_ } = await render.render(caseId, report!.id)
    expect(figureIn(document_).widthPt).toBeGreaterThan(0)
  }, 60_000)

  /**
   * **The case boundary, which the reference check enforces.**
   */
  it('refuses an evidence id from another case', async () => {
    const [other] = await seed!
      .insert(cases)
      .values({ title: 'Somebody else', createdBy: actorId })
      .returning()
    const [theirs] = await seed!
      .insert(evidence)
      .values({ caseId: other!.id, name: 'theirs.png', hash: 'c'.repeat(64), createdBy: actorId })
      .returning()
    const [report] = await seed!
      .insert(reports)
      .values({ caseId, label: 'Cross case', language: 'en', createdBy: actorId })
      .returning()

    await expect(
      collections.create(
        REPORT_BLOCKS_COLLECTION,
        caseId,
        { reportId: report!.id, kind: 'figure', position: 0, evidenceId: theirs!.id },
        actorId,
      ),
    ).rejects.toMatchObject({ status: 400 })
  }, 60_000)

  it('measures the artefact and places it inside the content column', async () => {
    const reportId = await placedFigure('png')
    const { document_, images } = await render.render(caseId, reportId)
    const node = figureIn(document_)

    // 400x300 pixels at 96 to the inch is 300x225pt, which fits the column, so
    // it is placed at its own size rather than scaled.
    expect(node.widthPt).toBe(300)
    expect(node.heightPt).toBe(225)
    expect(node.note).toBeUndefined()
    expect(images.get(node.hash!)).toBeDefined()
  }, 60_000)

  /**
   * **The bytes a painter receives are PNG whatever was attached.**
   */
  it('hands the painters PNG bytes for an attachment that was not', async () => {
    const reportId = await placedFigure('webp')
    const { document_, images } = await render.render(caseId, reportId)
    const bytes = images.get(figureIn(document_).hash!)

    expect(bytes).toBeDefined()
    // The PNG signature, which is what pdfmake sniffs for.
    expect(Buffer.from(bytes!).subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  }, 60_000)

  it('settles the size before anything paints, so the ruler and the file agree', async () => {
    const reportId = await placedFigure('png')
    const { document_, images } = await render.render(caseId, reportId)
    const { pageRuler, toPdf } = await import('./document/pdf.js')

    expect((await pageRuler(document_, images)).pages).toBeGreaterThan(0)
    expect((await toPdf(document_, images)).length).toBeGreaterThan(0)
    // Unchanged by either: a painter that resized would be the drift this
    // design exists to prevent.
    expect(figureIn(document_).widthPt).toBe(300)
  }, 60_000)

  it('serves a sent report bytes its painters can draw', async () => {
    const reportId = await placedFigure('webp')
    const { document_ } = await render.render(caseId, reportId)
    await seed!
      .update(reports)
      .set({ frozen: document_, frozenAt: new Date() })
      .where(eq(reports.id, reportId))

    const again = await render.render(caseId, reportId)
    expect(again.frozen).toBe(true)

    // **Not `toPdf` resolving alone**, which it also does with an empty map -
    // a figure with no bytes degrades to a caption, so that assertion passes
    // for a report whose image vanished. The bytes have to be there, and be
    // PNG.
    expect(again.images.size).toBe(1)
    expect(Buffer.from([...again.images.values()][0]!).subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
    const { toPdf } = await import('./document/pdf.js')
    await expect(toPdf(again.document_, again.images)).resolves.toBeDefined()
  }, 60_000)

  /**
   * The unrecoverable one: a report frozen with a zeroed size draws no image
   * for the life of the report, and there is no unlock route.
   */
  it('has a size on the tree by the time a send would freeze it', async () => {
    const reportId = await placedFigure('png')
    const { document_ } = await render.render(caseId, reportId)
    expect(figureIn(document_).widthPt).toBeGreaterThan(0)

    // And a frozen render loads the bytes without re-measuring: the filed
    // document keeps the size it was sent at.
    await seed!
      .update(reports)
      .set({ frozen: document_, frozenAt: new Date() })
      .where(eq(reports.id, reportId))

    const again = await render.render(caseId, reportId)
    expect(again.frozen).toBe(true)
    expect(figureIn(again.document_).widthPt).toBe(300)
    expect(again.images.size).toBe(1)
  }, 60_000)

  /**
   * **A truncated PNG passes `metadata()` and fails `.png()`**, so it only
   * degrades because the re-encode is inside the same `try` as the measure.
   */
  it.each([
    ['a truncated image', (bytes: Buffer) => bytes.subarray(0, 64)],
    ['something that is not an image', () => Buffer.from('%PDF-1.4\n%truncated')],
  ])('draws a caption and no image for %s', async (_case, damage) => {
    const { default: sharp } = await import('sharp')
    const whole = await sharp({
      create: { width: 400, height: 300, channels: 3, background: '#4f46e5' },
    })
      .png()
      .toBuffer()
    const stored = await store.put(Readable.from([damage(whole)]) as never, 'broken.png')

    const [row] = await seed!
      .insert(evidence)
      .values({ caseId, name: 'broken.png', hash: stored.hash, createdBy: actorId })
      .returning()
    const [report] = await seed!
      .insert(reports)
      .values({ caseId, label: 'Broken artefact', language: 'en', createdBy: actorId })
      .returning()
    await seed!.insert(reportBlocks).values({
      caseId,
      reportId: report!.id,
      kind: 'figure',
      position: 0,
      evidenceId: row!.id,
      createdBy: actorId,
    })

    const { document_, images } = await render.render(caseId, report!.id)
    expect(figureIn(document_).note).toContain('does not hold the image')
    expect(images.size).toBe(0)

    // And the export still succeeds, which is the whole point of degrading.
    const { toPdf } = await import('./document/pdf.js')
    await expect(toPdf(document_, images)).resolves.toBeDefined()
  }, 60_000)

  it('says so, and draws nothing, when this install does not hold the artefact', async () => {
    const [row] = await seed!
      .insert(evidence)
      .values({ caseId, name: 'lost.png', hash: 'b'.repeat(64), createdBy: actorId })
      .returning()
    const [report] = await seed!
      .insert(reports)
      .values({ caseId, label: 'Lost artefact', language: 'en', createdBy: actorId })
      .returning()
    await seed!.insert(reportBlocks).values({
      caseId,
      reportId: report!.id,
      kind: 'figure',
      position: 0,
      evidenceId: row!.id,
      createdBy: actorId,
    })

    const { document_, images } = await render.render(caseId, report!.id)
    const node = figureIn(document_)
    expect(node.widthPt).toBe(0)
    expect(node.note).toContain('does not hold the image')
    expect(images.size).toBe(0)
  }, 60_000)
})
