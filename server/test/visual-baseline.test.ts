/**
 * The visual sweep's baseline comparison.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { diffRatio } from '../e2e/visual/baseline.js'

let dir = ''

/** A flat PNG, so the expected ratio is exactly computable. */
async function paint(name: string, rgb: [number, number, number], stripe = 0): Promise<string> {
  const width = 100
  const height = 100
  const pixels = Buffer.alloc(width * height * 3)
  for (let at = 0; at < width * height; at += 1) {
    const row = Math.floor(at / width)
    const on = stripe > 0 && row < stripe
    pixels[at * 3] = on ? 255 - rgb[0] : rgb[0]
    pixels[at * 3 + 1] = on ? 255 - rgb[1] : rgb[1]
    pixels[at * 3 + 2] = on ? 255 - rgb[2] : rgb[2]
  }
  const path = join(dir, name)
  await writeFile(path, await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer())
  return path
}

describe('comparing a capture against its baseline', () => {
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ic-visual-'))
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('answers 0 for a capture that did not move', async () => {
    const before = await paint('a.png', [10, 20, 30])
    const after = await paint('b.png', [10, 20, 30])
    expect(await diffRatio(before, after)).toBe(0)
  })

  it('answers the fraction of pixels that changed, not merely "changed"', async () => {
    // A quarter of the rows inverted. The number is what makes the output an
    // index a reader can rank views by - "0.1% on a page you did not touch is
    // worth opening, 40% on the page you rewrote is expected".
    const before = await paint('c.png', [10, 20, 30])
    const after = await paint('d.png', [10, 20, 30], 25)
    expect(await diffRatio(before, after)).toBeCloseTo(0.25, 5)
  })

  it('calls a resized capture entirely different rather than incomparable', async () => {
    // **1, not null.** A page whose height changed *is* a difference, and the
    // most visible kind; returning "cannot compare" would file it as an
    // absence of evidence and drop it out of the report.
    const before = await paint('e.png', [10, 20, 30])
    const tall = join(dir, 'f.png')
    await writeFile(
      tall,
      await sharp({
        create: { width: 100, height: 200, channels: 3, background: { r: 10, g: 20, b: 30 } },
      })
        .png()
        .toBuffer(),
    )
    expect(await diffRatio(before, tall)).toBe(1)
  })

  it('answers null when a file is not an image at all', async () => {
    // Distinct from 1: a missing or corrupt capture is a fact about the run,
    // and reporting it as "100% different" would put it in the same column as
    // a real change.
    const good = await paint('g.png', [10, 20, 30])
    const junk = join(dir, 'h.png')
    await writeFile(junk, 'not a png')
    expect(await diffRatio(good, junk)).toBeNull()
  })
})
