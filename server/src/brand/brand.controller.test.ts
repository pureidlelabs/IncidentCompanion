/**
 * The two favicons, and the reasons they are easy to get wrong.
 *
 * **A favicon is the one asset whose failure is invisible in every automated
 * check.** No test renders a browser tab, the geometry probes cannot see it,
 * and a 404 for `/favicon.svg` leaves the page working - so the only thing
 * standing between a missing icon and shipping is a test that asks for it.
 */
import { PATH_METADATA } from '@nestjs/common/constants'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { BrandController } from './brand.controller.js'

/** The paths this controller actually answers on, read off the decorators. */
function routes(): string[] {
  const prototype = BrandController.prototype as unknown as Record<string, unknown>
  return Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => Reflect.getMetadata(PATH_METADATA, prototype[name] as object) as string)
    .filter((path): path is string => typeof path === 'string')
}

describe('the brand assets', () => {
  const controller = new BrandController()

  it('serves an SVG favicon', () => {
    const sent = controller.faviconSvg()
    expect(sent.type).toBe('image/svg+xml')
    expect(readFileSync(sent.path, 'utf8')).toContain('<svg')
  })

  it('serves an ICO favicon, which is the Safari fallback', () => {
    const sent = controller.faviconIco()
    expect(sent.type).toBe('image/x-icon')
    // The ICO magic number, so a text file renamed .ico fails here rather
    // than in a browser tab nobody is looking at.
    expect(readFileSync(sent.path).subarray(0, 4)).toEqual(Buffer.from([0, 0, 1, 0]))
  })

  it('keeps the light/dark switch inside the SVG, where Chrome honours it', () => {
    const svg = readFileSync(controller.faviconSvg().path, 'utf8')
    expect(svg).toContain('prefers-color-scheme')
  })

  /**
   * **The rule is "no route without a caller", and this route now has one.**
   */
  it('serves the wordmark the API reference asks for, and nothing more', () => {
    // Asserted against the decorated paths, not against a property name: a
    // route called anything else would pass a `toHaveProperty` check while
    // serving something this test never examined.
    expect(routes()).toEqual(
      expect.arrayContaining(['favicon.svg', 'favicon.ico', 'wordmark.png']),
    )
    // Still no `logo.png`: the sign-in screen draws `Mark` inline, so that
    // raster has no caller and does not get a route for company.
    expect(routes().some((path) => path.includes('logo'))).toBe(false)
  })

  /**
   * **A raster rather than the SVG, and the font is the reason.**
   */
  it('serves a raster, because an img cannot reach the page\u2019s webfont', () => {
    const png = readFileSync(
      join(dirname(controller.faviconSvg().path), 'wordmark-light.png'),
    )
    // The PNG signature, so this fails on a placeholder or an SVG renamed.
    expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
  })
})
