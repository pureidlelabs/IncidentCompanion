/**
 * A `position: fixed` box resolves against the viewport, wherever it is mounted.
 */
import { expect, test, type Page } from '@playwright/test'

import { ADMIN, asAdminApi, asPersona, requireServedApp, section, settle } from '../support/app.js'

/**
 * The sections whose bodies scroll, plus the two that mount a fixed anchor:
 * entities for the table's row menu, notes for the editor's caret anchor.
 */
const SECTIONS = ['timeline', 'entities', 'evidence', 'notes', 'report'] as const

/** One fixed box, and the ancestor that captured it. */
interface Capture {
  fixed: string
  by: string
  why: string
}

/**
 * Every fixed box whose containing block is not the viewport.
 */
async function capturedFixedBoxes(page: Page): Promise<Capture[]> {
  return page.evaluate(() => {
    const nameOf = (el: Element): string => {
      const slot = el.getAttribute('data-slot')
      // `getAttribute`, not `className`: on an SVG element the property is an
      // `SVGAnimatedString` rather than a string, and the attribute is neither.
      const cls = el.getAttribute('class') ?? ''
      return `${el.tagName.toLowerCase()}${slot === null ? '' : `[data-slot=${slot}]`}.${cls.split(/\s+/).filter(Boolean).slice(0, 3).join('.')}`
    }

    /** Why this element would be a containing block for a fixed child. */
    const captures = (style: CSSStyleDeclaration): string | null => {
      if (style.transform !== 'none') return `transform: ${style.transform}`
      if (style.perspective !== 'none') return `perspective: ${style.perspective}`
      if (style.filter !== 'none') return `filter: ${style.filter}`
      if (style.backdropFilter !== 'none' && style.backdropFilter !== '')
        return `backdrop-filter: ${style.backdropFilter}`
      if (/paint|layout|strict|content/.test(style.contain)) return `contain: ${style.contain}`
      if (/transform|perspective|filter|contain/.test(style.willChange))
        return `will-change: ${style.willChange}`
      if (style.translate !== 'none' || style.rotate !== 'none' || style.scale !== 'none')
        return `translate/rotate/scale set`
      return null
    }

    const found: { fixed: string; by: string; why: string }[] = []
    for (const el of document.querySelectorAll('*')) {
      if (getComputedStyle(el).position !== 'fixed') continue
      for (let up = el.parentElement; up !== null; up = up.parentElement) {
        const why = captures(getComputedStyle(up))
        if (why !== null) {
          found.push({ fixed: nameOf(el), by: nameOf(up), why })
          break
        }
      }
    }
    return found
  })
}

test('no fixed box resolves against anything but the viewport', async ({ browser, baseURL }) => {
  await requireServedApp(baseURL ?? '')

  const { page } = await asPersona(browser, ADMIN)
  await page.setViewportSize({ width: 1440, height: 900 })

  // **The demo case, by id.** An empty fixture draws every empty state, and a
  // table with no rows has no row menu to anchor.
  const api = await asAdminApi(baseURL ?? '')
  const cases = (await (await api.get('/api/cases')).json()) as { id: string; isDemo?: boolean }[]
  const demo = cases.find((one) => one.isDemo)
  if (!demo) throw new Error('no demo case is installed - this needs real content')

  await page.goto(`/cases/${demo.id}/timeline`)
  await settle(page)

  const captured: (Capture & { section: string })[] = []
  for (const slug of SECTIONS) {
    await section(page, slug)
    await settle(page)
    for (const one of await capturedFixedBoxes(page)) captured.push({ section: slug, ...one })
  }

  expect(
    captured,
    captured
      .map(
        (one) =>
          `on ${one.section}: ${one.fixed} resolves against ${one.by} (${one.why}) rather than the viewport. ` +
          'Portal it to document.body, the way OverlayAnchor does.',
      )
      .join('\n'),
  ).toEqual([])
})
