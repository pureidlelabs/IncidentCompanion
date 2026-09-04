/**
 * A stuck header's own top edge is painted in its own ground.
 *
 * **The one oracle that matches what a person sees.** Every other check of
 * this defect asks `getBoundingClientRect` whether a strip exists above the
 * header, and gets `0` -- correctly, because the strip is not in the layout.
 * A sticky layer and the content scrolling beneath it are composited
 * separately and snapped to device pixels independently, so a scrollport whose
 * origin lands on a fractional CSS pixel can round the two apart and leave a
 * sliver of row painted where the header is meant to be opaque. No rect
 * carries that, and hit-testing does not either: the pixel belongs to the
 * header as far as the DOM is concerned.
 *
 * So this reads the pixels. At `deviceScaleFactor: 2` it captures the top of
 * every stuck header and asks whether the first device-pixel rows are the
 * ground the header declares.
 *
 * **It scrolls, which nothing else in this tier does.** `probe.js` and the
 * sweep run against a page at rest -- eleven checks, none of which has ever
 * moved a scrollport -- so a defect that only exists once content travels
 * under a sticky element is outside what they can perceive by construction.
 *
 * ```bash
 * cd server && npx playwright test -c e2e/visual/playwright.visual.config.ts \
 *   e2e/visual/sticky-seam.spec.ts
 * ```
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { asPersona, ANALYST, collectConsoleErrors, settle } from '../support/app'

/** The preseeded case the UI is checked against: DEMO-2026-031, the major one. */
const CASE = process.env['IC_DEMO_CASE'] ?? 'dbde6018-c09e-4c16-8795-39201aa63aa2'

/** Sections whose body scrolls something under a sticky head. */
const SECTIONS = [
  'entities',
  'assets',
  'accounts',
  'network',
  'malware',
  'timeline',
  'timeline-graph',
  'evidence',
  'methods',
  'report',
]

/** Where a magnified crop of any seam is written, for a person to look at. */
const CROPS = join(process.env['CLAUDE_JOB_DIR'] ?? '/tmp', 'seam')

/**
 * Every sticky element on the page with a ground of its own, its scrollport,
 * and how far that scrollport can travel.
 */
async function stickyHeads(page: Page) {
  return page.evaluate(() => {
    // **Resolve through a canvas rather than parsing the string.** A computed
    // background is whatever the author wrote -- these tokens compute to
    // `oklch(...)`, and an `rgb()` regex rejects every one of them while
    // reporting that the page holds no sticky element at all.
    const pad = document.createElement('canvas')
    pad.width = 1
    pad.height = 1
    const px = pad.getContext('2d', { willReadFrequently: true })!
    const resolve = (c: string): [number, number, number, number] => {
      px.clearRect(0, 0, 1, 1)
      px.fillStyle = c
      px.fillRect(0, 0, 1, 1)
      const d = px.getImageData(0, 0, 1, 1).data
      return [d[0]!, d[1]!, d[2]!, d[3]!]
    }
    const rejects: string[] = []
    const found: {
      sel: string
      slot: string
      bg: [number, number, number]
      canScrollBy: number
      portSel: string
    }[] = []
    for (const el of document.querySelectorAll<HTMLElement>('*')) {
      const s = getComputedStyle(el)
      if (s.position !== 'sticky') continue
      const [r, g, b, a] = resolve(s.backgroundColor)
      let port: HTMLElement | null = el.parentElement
      for (; port !== null; port = port.parentElement) {
        const ps = getComputedStyle(port)
        if (/auto|scroll/.test(ps.overflowY)) break
      }
      const travel = port === null ? -1 : port.scrollHeight - port.clientHeight
      const slot = el.dataset['slot'] ?? el.tagName.toLowerCase()
      rejects.push(`${slot} bg=${s.backgroundColor} alpha=${a} port=${port === null ? 'none' : (port.dataset['slot'] ?? port.tagName)} travel=${travel}`)
      if (a < 240) continue
      if (port === null || travel <= 4) continue
      found.push({
        sel: `[data-slot="${slot}"]`,
        slot,
        bg: [r, g, b],
        canScrollBy: travel,
        portSel: port.dataset['slot'] ? `[data-slot="${port.dataset['slot']}"]` : 'unnamed',
      })
    }
    return { found, rejects }
  })
}

/**
 * The worst colour deviation in the top `bandCss` CSS pixels of `sel`, over a
 * sweep of scroll positions.
 *
 * Fractional scroll offsets are included deliberately: an integer-only sweep
 * cannot produce the fractional layer origin the seam needs.
 */
async function seamAt(
  page: Page,
  sel: string,
  portSel: string,
  bg: [number, number, number],
  bandCss: number,
) {
  let worst = { delta: 0, at: 0, sample: [0, 0, 0] as number[], where: '' }
  // **Only where the head is stuck.** At rest its top edge is the container's
  // own border, which is not its ground and never was a defect. Fractional
  // offsets are included deliberately: an integer-only sweep cannot produce
  // the fractional layer origin a compositing seam needs.
  for (const step of [40, 47.5, 64, 80.5, 96, 111.5, 129, 160.5, 200, 256.5, 320]) {
    await page.evaluate(
      ([p, n]) => {
        const port = document.querySelector(p as string)
        if (port instanceof HTMLElement) port.scrollTop = n as number
      },
      [portSel, step] as const,
    )
    await page.waitForTimeout(60)
    const box = await page.locator(sel).first().boundingBox()
    if (box === null) continue
    const shot = await page.screenshot({
      clip: { x: box.x + 2, y: box.y, width: Math.min(box.width - 4, 900), height: bandCss },
    })
    const seen = await page.evaluate(
      async ([url, want]) => {
        const img = new Image()
        await new Promise((r) => {
          img.onload = r
          img.src = url as string
        })
        const c = document.createElement('canvas')
        c.width = img.width
        c.height = img.height
        const ctx = c.getContext('2d')!
        ctx.drawImage(img, 0, 0)
        const d = ctx.getImageData(0, 0, img.width, img.height).data
        const [wr, wg, wb] = want as number[]
        let delta = 0
        let sample = [0, 0, 0]
        let at = { x: 0, y: 0 }
        let off = 0
        for (let i = 0; i < d.length; i += 4) {
          const dev =
            Math.abs(d[i]! - wr!) + Math.abs(d[i + 1]! - wg!) + Math.abs(d[i + 2]! - wb!)
          if (dev > 40) off++
          if (dev > delta) {
            delta = dev
            sample = [d[i]!, d[i + 1]!, d[i + 2]!]
            const px = i / 4
            at = { x: px % img.width, y: Math.floor(px / img.width) }
          }
        }
        return { delta, sample, at, off, w: img.width }
      },
      ['data:image/png;base64,' + shot.toString('base64'), bg] as const,
    )
    if (seen.delta > worst.delta)
      worst = {
        delta: seen.delta,
        at: step,
        sample: seen.sample,
        where: `x${seen.at.x} of ${seen.w}, y${seen.at.y}, ${seen.off} px off`,
      }
  }
  return worst
}

test.describe('a stuck header paints its own top edge', () => {
  const W = Number(process.env['SEAM_W'] ?? 1440)
  const H = Number(process.env['SEAM_H'] ?? 900)
  test.use({ viewport: { width: W, height: H }, deviceScaleFactor: 2 })

  for (const slug of SECTIONS) {
    test(`${slug} lets no row through the seam`, async ({ browser }) => {
      const { context, page } = await asPersona(browser, ANALYST)
      const errors = collectConsoleErrors(page)
      try {
        await page.goto(`/cases/${CASE}/${slug}`, { waitUntil: 'domcontentloaded' })
        await settle(page)
        await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
        await page.waitForTimeout(400)

        const { found: heads } = await stickyHeads(page)
        console.log(`${slug}: ${heads.length} sticky heads, console errors: ${errors.length}`)
        for (const e of errors.slice(0, 5)) console.log(`  console: ${e.slice(0, 160)}`)
        test.skip(heads.length === 0, `${slug} has no sticky head over a scrolling box`)

        mkdirSync(CROPS, { recursive: true })
        const bad: string[] = []
        for (const h of heads) {
          const worst = await seamAt(page, h.sel, h.portSel, h.bg, 2)
          console.log(
            `  ${h.slot} in ${h.portSel}: worst deviation ${worst.delta} at scrollTop ${worst.at} (saw rgb(${worst.sample.join(',')}) want rgb(${h.bg.join(',')}))`,
          )
          if (worst.delta > 30) {
            await page.evaluate(
              ([p, n]) => {
                const port = document.querySelector(p as string)
                if (port instanceof HTMLElement) port.scrollTop = n as number
              },
              [h.portSel, worst.at] as const,
            )
            await page.waitForTimeout(150)
            const box = await page.locator(h.sel).first().boundingBox()
            if (box !== null) {
              await page.screenshot({
                path: join(CROPS, `${slug}-${h.slot}.png`),
                clip: { x: box.x, y: box.y - 8, width: Math.min(box.width, 700), height: 30 },
              })
            }
            bad.push(
              `${h.slot} bleeds at scrollTop ${worst.at} (${worst.where}): painted rgb(${worst.sample.join(',')}), ground rgb(${h.bg.join(',')})`,
            )
          }
        }
        expect(bad, `content shows through the top edge of a stuck header`).toEqual([])
      } finally {
        await context.close()
      }
    })
  }
})
