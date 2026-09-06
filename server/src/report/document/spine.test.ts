/**
 * The kill chain drawn as diamonds, through the geometry and both painters.
 *
 * **The defect this tier exists for is a drawing that renders and says
 * nothing.** A spine whose labels are missing, whose marks are stacked on one
 * another, or whose PNG is a blank rectangle is a picture in a customer
 * document that looks deliberate. None of those fail; they all export.
 */
import { describe, expect, it } from 'vitest'

import { labelExtent, spineGeometry, spinePng, spineSvg, widthOf } from './spine.js'
import { CONTENT_PT as PDF_WIDTH, definitionFor } from './pdf.js'
import { CONTENT_PT as WORD_WIDTH, toWord } from './word.js'
import { toMarkdown } from './markdown.js'
import { MUTED, PAPER, PHASE_SEVERITY } from './palette.js'
import type { Document, Node } from './model.js'

const PHASES = [
  { label: 'initial access', fill: '#eab308' },
  { label: 'execution', fill: '#f97316' },
  { label: 'command and control', fill: '#ef4444' },
]

const SPINE: Node = { type: 'spine', phases: PHASES, foot: 'Phases reached: 3 of 14' }

/**
 * Every phase, which is the widest the drawing ever has to be.
 *
 * Taken from the ramp itself rather than typed out, so a phase added to the
 * vocabulary is covered here the day it arrives.
 */
const FULL_REACH = Object.entries(PHASE_SEVERITY).map(([label, fill]) => ({ label, fill }))

/**
 * The label rows out of a pdfmake definition, as `{ width, text }` per column.
 *
 * Walked rather than matched in the JSON: a substring check reads a width that
 * appears anywhere as a width that appears in the right row, and passes a
 * definition twice the width of the page.
 */
function labelRowsOf(definition: unknown): { width: number; text: string }[][] {
  const found: { width: number; text: string }[][] = []
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const one of value) walk(one)
      return
    }
    if (typeof value !== 'object' || value === null) return
    const node_ = value as { columns?: unknown; content?: unknown; stack?: unknown }
    if (Array.isArray(node_.columns)) {
      found.push(
        (node_.columns as { width?: unknown; text?: unknown }[]).map((column) => ({
          width: typeof column.width === 'number' ? column.width : Number.NaN,
          text: typeof column.text === 'string' ? column.text : '',
        })),
      )
    }
    walk(node_.content)
    walk(node_.stack)
  }
  walk(definition)
  return found
}

const paper = (nodes: Node[]): Document => ({
  title: 'CASE-1',
  tlp: '',
  language: 'en',
  languageCoverage: 1,
  sections: [{ blockId: 'b', kind: 'ribbon', heading: 'Kill chain', nodes }],
})

describe('the spine geometry', () => {
  it('measures a string from the face the document is set in', () => {
    // Not a character count: the labels are centred and wrapped against this,
    // so a guess at the width puts every label off its own diamond.
    expect(widthOf('execution', 10)).toBeGreaterThan(30)
    expect(widthOf('execution', 10)).toBeLessThan(60)
    // Monotonic in the size, or the wrap is measuring something else.
    expect(widthOf('execution', 20)).toBeCloseTo(widthOf('execution', 10) * 2, 4)
  })

  it('puts each mark at the centre of its own equal column', () => {
    const geometry = spineGeometry(PHASES, 300)
    // 300/3 = 100 wide, so centres at 50, 150, 250. This is what lets the PDF
    // flow the labels as equal columns and have them land under the diamonds.
    expect(geometry.marks.map((mark) => mark.x)).toEqual([50, 150, 250])
  })

  /**
   * **A long phase name wraps rather than colliding with its neighbour.**
   * `command and control` is the case: at a narrow column it has to break, and
   * a spine that lets it run wide overlaps the label beside it.
   */
  it('wraps a label too wide for its column, and grows the drawing to fit', () => {
    const narrow = spineGeometry(PHASES, 180)
    const wide = spineGeometry(PHASES, 900)
    const wrapped = narrow.marks[2]!

    expect(wrapped.lines.length).toBeGreaterThan(1)
    expect(wrapped.lines.join(' ')).toBe('command and control')
    // Every line is a line of height, so the drawing is taller when it wraps.
    expect(narrow.heightPt).toBeGreaterThan(wide.heightPt)
  })

  it('keeps one phase centred rather than dividing by zero', () => {
    const geometry = spineGeometry([PHASES[0]!], 300)
    expect(geometry.marks[0]!.x).toBe(150)
  })

  /**
   * **Nothing may cross the drawing's edges.** `spineSvg` writes a viewBox of
   * exactly the drawing, so a label reaching past it is cut and loses
   * characters -- and a shipped demo reaches ten phases, so the widths where it
   * happens are ordinary output rather than an extreme.
   *
   * Both page widths, because they differ and the narrower fails first.
   */
  it.each([
    ['the PDF', PDF_WIDTH],
    ['Word', WORD_WIDTH],
  ])('keeps every label inside the drawing at %s, to full reach', (_where, width) => {
    for (let reach = 2; reach <= FULL_REACH.length; reach++) {
      const geometry = spineGeometry(FULL_REACH.slice(0, reach), width)
      for (const mark of geometry.marks) {
        const [left, right] = labelExtent(mark, geometry.labelSize)
        expect(left, `"${mark.label}" at reach ${String(reach)} runs off the left`).toBeGreaterThanOrEqual(0)
        expect(right, `"${mark.label}" at reach ${String(reach)} runs off the right`).toBeLessThanOrEqual(width)
      }
    }
  })

  /**
   * **Not "no line exceeds its room".** That rule is the geometry checking its
   * own arithmetic, and it holds while the drawing overlaps anyway, because the
   * room is a column the PDF does not use. What matters is only this: two
   * labels on one row may not touch.
   */
  it.each([
    ['the PDF', PDF_WIDTH],
    ['Word', WORD_WIDTH],
  ])('never lets two same-row labels touch at %s, to full reach', (_where, width) => {
    for (let reach = 2; reach <= FULL_REACH.length; reach++) {
      const geometry = spineGeometry(FULL_REACH.slice(0, reach), width)
      for (const row of [0, 1] as const) {
        const here = geometry.marks.filter((mark) => mark.row === row)
        for (let k = 0; k + 1 < here.length; k++) {
          const before = labelExtent(here[k]!, geometry.labelSize)[1]
          const after = labelExtent(here[k + 1]!, geometry.labelSize)[0]
          expect(
            after,
            `"${here[k]!.label}" meets "${here[k + 1]!.label}" at reach ${String(reach)}`,
          ).toBeGreaterThanOrEqual(before)
        }
      }
    }
  })

  it('staggers only when it has to, so a short chain keeps one row', () => {
    expect(spineGeometry(FULL_REACH.slice(0, 3), PDF_WIDTH).staggered).toBe(false)
    expect(spineGeometry(FULL_REACH, PDF_WIDTH).staggered).toBe(true)
  })

  it('drops alternate labels to the second row when staggered', () => {
    const geometry = spineGeometry(FULL_REACH, PDF_WIDTH)
    expect(geometry.marks.map((mark) => mark.row)).toEqual(
      FULL_REACH.map((_phase, at) => (at % 2 === 1 ? 1 : 0)),
    )
    // Two rows of labels is a taller drawing; the foot must not ride over them.
    expect(geometry.heightPt).toBeGreaterThan(spineGeometry(FULL_REACH.slice(0, 3), PDF_WIDTH).heightPt)
  })
})

describe('the spine as SVG', () => {
  it('draws a filled diamond per phase and a line joining them', () => {
    const svg = spineSvg(spineGeometry(PHASES, 300))
    expect((svg.match(/<path d="M /g) ?? []).length).toBe(PHASES.length)
    expect(svg).toContain('<line')
    for (const phase of PHASES) expect(svg).toContain(phase.fill)
  })

  /**
   * **Labels are outlines, never `<text>`, and this structural check is the
   * only reliable guard for it.** sharp rasterises through librsvg, which
   * resolves a font via fontconfig; where there is none it draws the diamonds,
   * draws no label, and does not fail -- an unheeded `Fontconfig error` is all
   * it leaves.
   *
   * **Whether it renders is environment-dependent, which is what makes it worth
   * asserting structurally.** Mutating this module to emit `<text>` draws no
   * label under a bare `node` process and a full one under vitest, from the
   * same SVG. So the pixel count below cannot catch this regression: it passes
   * wherever a fallback font happens to exist, and the machine that ships is
   * not the machine that ran the suite.
   */
  it('never hands the rasteriser a text element', () => {
    expect(spineSvg(spineGeometry(PHASES, 300))).not.toContain('<text')
  })

  it('paints the labels in the muted ink and on paper', () => {
    const svg = spineSvg(spineGeometry(PHASES, 300))
    expect(svg).toContain(MUTED)
    // An opaque ground: Word composites a transparent PNG against whatever is
    // behind it, which in a shaded band is not the paper. A bare
    // `toContain('<rect')` is satisfied by `fill="none"`, so the fill is the
    // assertion.
    expect(svg).toContain(`fill="${PAPER}"`)
  })
})

describe('the spine as pixels', () => {
  /**
   * **Counted, because "a PNG was produced" is not the claim.** The failure
   * this guards is a drawing that rasterises to a blank or diamond-only
   * rectangle, which is a perfectly valid PNG.
   *
   * **It does not cover the `<text>` regression**, and the sibling above says
   * why: emitting `<text>` leaves this green wherever librsvg finds any
   * fallback face, which it did under vitest and did not under bare `node`.
   * What this asserts is that the outlines reach the pixels at all.
   */
  it('rasterises the labels as well as the diamonds', async () => {
    const drawn = await spinePng(spineGeometry(PHASES, 300), 2)
    expect(drawn).not.toBeNull()

    const { default: sharp } = await import('sharp')
    const { data, info } = await sharp(drawn!.png)
      .raw()
      .toBuffer({ resolveWithObject: true })

    const geometry = spineGeometry(PHASES, 300)
    const scale = info.height / geometry.heightPt
    const below = Math.round((geometry.lineY + geometry.radius + 4) * scale)
    let marks = 0
    let labels = 0
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const at = (y * info.width + x) * info.channels
        if (data[at]! > 240 && data[at + 1]! > 240 && data[at + 2]! > 240) continue
        if (y < below) marks++
        else labels++
      }
    }
    expect(marks).toBeGreaterThan(0)
    expect(labels).toBeGreaterThan(0)
  })
})

describe('the spine through the painters', () => {
  it('is drawn as vector marks in the PDF, not as a table', () => {
    const found = JSON.stringify(definitionFor(paper([SPINE])))
    expect(found).toContain('polyline')
    expect(found).toContain('initial access')
    expect(found).toContain('Phases reached: 3 of 14')
  })

  /**
   * **The PDF's label boxes are the geometry's boxes.** Every pixel case here
   * rasterises through the SVG, which is Word's path, so without this the PDF's
   * own label layout has no coverage at all -- deleting its stagger outright
   * leaves the whole suite green.
   *
   * pdfmake re-breaks whatever text it is handed against the width of the box
   * it is in, so the box is the only thing that makes its wrap agree with the
   * geometry's. A `'*'` width here means it is wrapping to something else.
   *
   * **Per row, and the widths must be that row's -- not "these numbers appear
   * somewhere".** Asserting each `boxWidth` is present in the definition and
   * counting two `columns` rows survives every mark being forced onto row 0:
   * the widths are all still emitted and the empty second row still counts.
   * Such a definition puts a row twice the page's width into the page, and
   * pdfmake renders it without complaint.
   */
  it('hands pdfmake exactly the boxes of each row, at full reach', () => {
    const geometry = spineGeometry(FULL_REACH, PDF_WIDTH)
    const spine: Node = { type: 'spine', phases: FULL_REACH, foot: 'Phases reached: 14 of 14' }
    const emitted = labelRowsOf(definitionFor(paper([spine])))

    expect(geometry.staggered).toBe(true)
    expect(emitted).toHaveLength(2)

    for (const row of [0, 1] as const) {
      const here = geometry.marks.filter((mark) => mark.row === row)
      const widths = emitted[row]!.map((column) => column.width)

      expect(widths, `row ${String(row)} is not this row's boxes`).toEqual(
        here.map((mark) => mark.boxWidth),
      )
      // The boxes tile the row, so anything else is a row wider than the page.
      expect(widths.reduce((sum, one) => sum + one, 0)).toBeCloseTo(PDF_WIDTH, 6)
      // And each label goes over whole, for pdfmake to break inside that box.
      expect(emitted[row]!.map((column) => column.text)).toEqual(here.map((mark) => mark.label))
    }
  })

  it('draws one label row when it does not stagger', () => {
    expect(labelRowsOf(definitionFor(paper([SPINE])))).toHaveLength(1)
  })

  it('reaches the .docx as an embedded image', async () => {
    const file = await toWord(paper([SPINE]))
    const { default: JSZip } = await import('jszip')
    const zip = await JSZip.loadAsync(file)
    // A drawing is a media part; a paragraph of phase names is not.
    const media = Object.keys(zip.files).filter((name) => name.startsWith('word/media/'))
    expect(media.length).toBeGreaterThan(0)
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toContain('Phases reached: 3 of 14')
  })

  /**
   * **Four exports at once, each keeping its own drawing.**
   *
   * Rendered PNGs held in module-level state are safe only while no `await`
   * sits between filling them and the synchronous walk that reads them --
   * inserting one loses *every* concurrent export's drawing and leaves the
   * suite green, because the text fallback is valid output. The map is a
   * parameter, so nothing here can reach that; the case stays because the next
   * person reaching for module state should find it red.
   */
  it('keeps each export its own drawing when several run at once', async () => {
    const { default: JSZip } = await import('jszip')
    const reaches = [1, 6, 12, 3]
    const files = await Promise.all(
      reaches.map((reach) =>
        toWord(
          paper([
            {
              type: 'spine',
              phases: FULL_REACH.slice(0, reach),
              foot: `Phases reached: ${String(reach)} of 14`,
            },
          ]),
        ),
      ),
    )

    for (const [at, file] of files.entries()) {
      const zip = await JSZip.loadAsync(file)
      const media = Object.keys(zip.files).filter((name) => name.startsWith('word/media/'))
      expect(media.length, `export ${String(at)} lost its drawing`).toBeGreaterThan(0)
      const xml = await zip.file('word/document.xml')!.async('string')
      // The fallback spells the phases with this separator; a drawing never does.
      expect(xml, `export ${String(at)} fell back to text`).not.toContain('\u203a')
    }
  }, 60_000)

  /**
   * The archive is text and carries no picture, by the same rule that keeps a
   * figure's hash in the `.md` and not its bytes - but it may not lose the
   * phases.
   */
  it('writes the path in words in the markdown', () => {
    const out = toMarkdown(paper([SPINE]))
    expect(out).toContain('initial access')
    expect(out).toContain('command and control')
    expect(out).toContain('Phases reached: 3 of 14')
  })
})
