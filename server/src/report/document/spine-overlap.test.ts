/**
 * Two labels of the kill chain may never touch, measured in pixels.
 *
 * **Its own file because it rasterises**, which is slow enough that burying it
 * among the geometry unit tests would make those unpleasant to run.
 *
 * **Pixels rather than only arithmetic, because the arithmetic is the thing
 * under test.** `spine.test.ts` asserts the geometry's own invariants, and a
 * rule can be self-consistently wrong - it was, and the drawing overlapped
 * anyway. This renders the real PNG and looks.
 *
 * **Every case here is the rasteriser, which is Word's path.** The widths are
 * named for the page whose content column they are, not for a painter: the PDF
 * draws vector and is asserted over its definition in `spine.test.ts`. Two
 * cases here were called "the PDF" while never importing `pdf.ts`, and deleting
 * the PDF's stagger outright left them green.
 *
 * **The measure is the gap the geometry promised, checked in ink.** Two
 * earlier measures were wrong in the same way and both had to be thrown out:
 * ink on a column boundary, then ink at the midpoint between two marks. Once
 * labels are laid out in tiled boxes with anchors, a label crossing a boundary
 * is ordinary - it is using the space its neighbour left - and only two labels
 * actually *touching* is a defect.
 *
 * So it asks the geometry where the gap between two adjacent same-row labels
 * is, then asks the pixels whether that gap is clear - a cross-check rather
 * than a restatement: a painter drawing wider than the geometry promised closes
 * the gap and goes red.
 */
import { describe, expect, it } from 'vitest'

import { labelExtent, spineGeometry, spinePng } from './spine.js'
import { PHASE_SEVERITY } from './palette.js'
import { CONTENT_PT as PDF_WIDTH } from './pdf.js'
import { CONTENT_PT as WORD_WIDTH } from './word.js'

/** Every phase, from the ramp, so a new one is covered the day it is added. */
const FULL = Object.entries(PHASE_SEVERITY).map(([label, fill]) => ({ label, fill }))

/** How many pairs of same-row neighbours have ink where they would collide. */
async function collisions(reach: number, width: number): Promise<number> {
  const geometry = spineGeometry(FULL.slice(0, reach), width)
  const drawn = await spinePng(geometry, 4)
  if (!drawn) throw new Error('the rasteriser refused, so this proved nothing')

  const { default: sharp } = await import('sharp')
  const { data, info } = await sharp(drawn.png).raw().toBuffer({ resolveWithObject: true })
  const scale = info.width / width

  const band = (row: 0 | 1): [number, number] => {
    const top =
      geometry.lineY +
      geometry.radius +
      4 +
      (row === 1 ? geometry.firstRowLines * geometry.lineHeight : 0)
    const bottom =
      row === 1 || !geometry.staggered
        ? geometry.heightPt
        : top + geometry.firstRowLines * geometry.lineHeight
    return [Math.round(top * scale), Math.round(bottom * scale)]
  }

  let hits = 0
  for (const row of [0, 1] as const) {
    const here = geometry.marks.filter((mark) => mark.row === row)
    if (here.length < 2) continue
    const [top, bottom] = band(row)
    for (let k = 0; k + 1 < here.length; k++) {
      const gapStart = labelExtent(here[k]!, geometry.labelSize)[1]
      const gapEnd = labelExtent(here[k + 1]!, geometry.labelSize)[0]
      // The geometry says these two do not touch. If it is wrong the gap is
      // negative, which is a collision before a pixel is drawn.
      if (gapEnd <= gapStart) {
        hits++
        continue
      }
      // And if it is right, the middle of that gap must be clear ink-wise.
      const mid = Math.round(((gapStart + gapEnd) / 2) * scale)
      let found = false
      for (let y = top; y < Math.min(bottom, info.height) && !found; y++) {
        const at = (y * info.width + mid) * info.channels
        if (data[at]! < 200 || data[at + 1]! < 200 || data[at + 2]! < 200) found = true
      }
      if (found) hits++
    }
  }
  return hits
}

describe('the drawn kill chain', () => {
  /**
   * Nine and ten are where it first broke, and fourteen is the whole
   * vocabulary. A shipped demo case reaches ten, so this was ordinary output.
   */
  it.each([
    ['ten phases at the PDF page width', 10, PDF_WIDTH],
    ['full reach at the PDF page width', 14, PDF_WIDTH],
    ['nine phases at the Word page width', 9, WORD_WIDTH],
    ['ten phases at the Word page width', 10, WORD_WIDTH],
    ['full reach at the Word page width', 14, WORD_WIDTH],
  ])('never lets two labels meet: %s', async (_case, reach, width) => {
    expect(await collisions(reach, width)).toBe(0)
  }, 30_000)
})
