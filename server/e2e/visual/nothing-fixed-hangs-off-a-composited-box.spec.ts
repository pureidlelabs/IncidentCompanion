/**
 * A `position: fixed` box resolves against the viewport, wherever it is mounted.
 *
 * **The trap this exists for.** Three scrollports carry `will-change:
 * transform`, because a scrollport whose top lands on a fractional pixel rounds
 * its clip and its sticky header onto different device rows and one row of what
 * is behind shows through. Measured in Firefox at a scrollport top of `223.883`:
 * with `transform` the top device row is a single flat colour, and with
 * `opacity` or `auto` it holds six -- so the promotion is load-bearing and no
 * weaker hint substitutes for it.
 *
 * The cost is not optional either. A transform, a filter, a perspective,
 * `contain: paint`, or a `will-change` naming any of those makes that element
 * the containing block for every fixed descendant -- so an anchor stating
 * viewport coordinates lands offset by the box's own origin instead. Measured
 * at 265px across and 24px down on the entities table, which put a row's
 * context menu most of a screen from the pointer that opened it.
 *
 * It names the fixed element and the ancestor capturing it, because the failure
 * is invisible until a pointer coordinate goes through it. With the portal in
 * `OverlayAnchor` disabled it reports five captures across four scrollports, so
 * a clean run is not a run over nothing.
 *
 * **Not a grep.** Most `fixed` in this tree is the English word or
 * `table-fixed`, and the ones that matter are computed rather than written --
 * so the question is only answerable against a rendered document.
 *
 * ```bash
 * npx playwright test --config=e2e/playwright.config.ts \
 *   e2e/visual/nothing-fixed-hangs-off-a-composited-box.spec.ts
 * ```
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
 *
 * The set of properties is the spec's, not a guess: `transform`, `perspective`,
 * `filter`, `backdrop-filter`, `contain` naming paint or layout, and
 * `will-change` naming any of them. `translate`, `rotate` and `scale` are the
 * individual transform properties and do the same thing.
 */
async function capturedFixedBoxes(page: Page): Promise<Capture[]> {
  return page.evaluate(() => {
    const nameOf = (el: Element): string => {
      const slot = el.getAttribute('data-slot')
      const cls = el.className instanceof SVGAnimatedString ? '' : String(el.className)
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
