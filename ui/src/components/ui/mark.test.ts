import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The inline mark and the served one are the same drawing.
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
