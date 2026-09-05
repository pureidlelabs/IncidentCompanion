/**
 * The sweep: every rail section, in both grounds, captured and probed.
 */
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

import type { Browser } from '@playwright/test'

import {
  ADMIN,
  asPersona,
  openFirstCase,
  openPane,
  panes,
  sections,
  section,
} from '../support/app.js'

import type { Finding } from './probe.js'
import { driveImportReview, findings, quiesce, setGround, shoot, type Ground } from './view.js'

export interface Report {
  captures: number
  findings: { where: string; finding: Finding }[]
}

/**
 * Walk the case rail and capture each section.
 */
export async function sweep(
  browser: Browser,
  options: {
    out: string
    grounds: Ground[]
    only?: string[]
  },
): Promise<Report> {
  await rm(options.out, { recursive: true, force: true })
  await mkdir(options.out, { recursive: true })

  const report: Report = { captures: 0, findings: [] }
  const { context, page } = await asPersona(browser, ADMIN)
  try {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openFirstCase(page)

    const offered = await sections(page)
    const wanted = options.only?.length
      ? offered.filter((one) => options.only?.includes(one.slug))
      : offered
    if (options.only?.length) {
      const missing = options.only.filter((slug) => !offered.some((one) => one.slug === slug))
      // Named rather than skipped: asking for a slug that does not exist and
      // getting a clean run back is the empty-set shape that reads as
      // reassurance.
      if (missing.length) throw new Error(`the rail offers no section named: ${missing.join(', ')}`)
    }

    for (const ground of options.grounds) {
      await setGround(page, ground)

      // **The picker first, and it is not an afterthought.** Every finding the
      // Python tier ever reported on this app was on a picker pane - the rail
      // sections came back clean - so a sweep that walked only the case would
      // have reported "no findings" while holding none of the views that had
      // any.
      if (!options.only?.length) {
        await page.goto('/')
        await quiesce(page)
        for (const pane of await panes(page)) {
          await openPane(page, pane)
          await shoot(page, join(options.out, `${ground}-picker-${pane}.png`))
          report.captures += 1
          for (const finding of await findings(page)) {
            report.findings.push({ where: `${ground} - picker/${pane}`, finding })
          }
        }
        // **Back to the default pane before re-entering the case.**
        // `openFirstCase` does not navigate - it expects the cases table to be
        // on screen already, which after a pane walk it is not, and the
        // failure names the *case* rather than the pane the walk left open.
        await page.goto('/')
        await quiesce(page)
        await openFirstCase(page)
      }

      for (const one of wanted) {
        await section(page, one.slug)
        const name = `${ground}-${one.slug}.png`
        await shoot(page, join(options.out, name))
        report.captures += 1
        for (const finding of await findings(page)) {
          report.findings.push({ where: `${ground} - ${one.slug}`, finding })
        }

        // **The importer's review panel, which a fresh page never shows.** Its
        // first phase is a sign-in form; the screen an analyst works in is four
        // interactions past it, and that is the screen the feature is.
        if (one.slug === 'import-sentinel' && (await driveImportReview(page))) {
          const review = `${ground}-${one.slug}-review.png`
          await shoot(page, join(options.out, review))
          report.captures += 1
          for (const finding of await findings(page)) {
            report.findings.push({ where: `${ground} - ${one.slug}/review`, finding })
          }
        }
      }
    }
  } finally {
    await context.close()
  }
  return report
}
