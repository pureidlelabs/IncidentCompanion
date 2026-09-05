import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The inline mark and the served one are the same drawing.
 *
 * **Two copies of the geometry exist and there is no build step that could
 * make it one.** `Mark` has to be inline for the ground switcher to reach it,
 * and `server/assets/logo-light.svg` has to be a file for the README, the
 * `<img>` case and `tools/render_brand_assets.py`, which reads its numbers to
 * draw the rasters. So the duplication is deliberate and this is what stops it
 * drifting.
 *
 * **Source text, not a render.** jsdom lays nothing out and decodes no images,
 * so a mark that renders at 0px or with a broken path looks identical to a
 * correct one from inside the suite. What can be checked is that the two files
 * carry the same numbers.
 *
 * The mask is deliberately *not* compared: the SVG fades with a gradient
 * stroke and the component with a mask, because a gradient stop would have to
 * name a colour and a token in a presentation attribute does not resolve. Only
 * the geometry is shared, and only the geometry is asserted.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const ASSETS = join(HERE, '..', '..', '..', '..', 'server', 'assets')
const SVG = join(ASSETS, 'logo-light.svg')
const DARK = join(ASSETS, 'logo-dark.svg')
const TSX = join(HERE, 'mark.tsx')

/** Every capture of `pattern`, in order. Group 1 unless `group` says otherwise. */
function all(text: string, pattern: RegExp, group = 1): string[] {
  return [...text.matchAll(pattern)].flatMap((m) => {
    const value = m[group]
    return value === undefined ? [] : [value.trim()]
  })
}

/** Every `d="..."` in a source, in order. */
const paths = (text: string) => all(text, /\bd="([^"]+)"/g)

/** Every stroke width, however the source spells the attribute. */
const widths = (text: string) => all(text, /stroke-?[Ww]idth="([\d.]+)"/g)

/** `cx`, `cy` and `r` off the one circle. */
const circle = (text: string) => all(text, /\b(cx|cy|r)="([\d.]+)"/g, 2)

/** The beat's span, which the fade is keyed to at both ends. */
const span = (text: string) => all(text, /\b(x1|x2)="([\d.]+)"/g, 2)

describe('the inline mark matches the served drawing', () => {
  const svg = readFileSync(SVG, 'utf8')
  const tsx = readFileSync(TSX, 'utf8')

  it('draws the same paths', () => {
    expect(paths(tsx)).toEqual(paths(svg))
  })

  it('draws them at the same weights', () => {
    expect(widths(tsx)).toEqual(widths(svg))
  })

  it('places the ring identically', () => {
    expect(circle(tsx)).toEqual(circle(svg))
  })

  it('fades over the same span', () => {
    expect(span(tsx)).toEqual(span(svg))
  })

  /**
   * **The dark file is the only thing that reads it, and that is the point.**
   * Nothing serves `logo-dark.svg`: the app inlines the mark, so the pair
   * exists for the `<img>` case and for anyone taking the brand out of the
   * repo. An asset with no consumer drifts silently and then ships wrong, so
   * the guard is here rather than the file being deleted for tidiness.
   *
   * Only geometry is compared - the two differ in exactly the two literals
   * that make them a pair, which is checked by asserting they are *not*
   * identical.
   */
  it('keeps both ground variants on one drawing', () => {
    const dark = readFileSync(DARK, 'utf8')

    expect(paths(dark)).toEqual(paths(svg))
    expect(widths(dark)).toEqual(widths(svg))
    expect(circle(dark)).toEqual(circle(svg))
    expect(span(dark)).toEqual(span(svg))
    expect(dark).not.toEqual(svg)
  })
})
