/**
 * `npm run visual` - every rail section, both grounds, captured and probed.
 */
import { cp, mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { test } from '@playwright/test'

import { ensureAnalyst, ensureCase, requireServedApp } from '../support/app.js'

import { compare, vanished } from './baseline.js'
import { sweep } from './sweep.js'
import type { Ground } from './view.js'

/**
 * **`__dirname`, not `import.meta`.**
 */
const HERE = __dirname
const CURRENT = join(HERE, '../../.visual/current')
const BASELINE = join(HERE, '../../.visual/baseline')

const GROUNDS = (process.env.VISUAL_GROUNDS ?? 'light,dark').split(',').filter(Boolean) as Ground[]
const ONLY = process.env.VISUAL_SECTIONS?.split(',').filter(Boolean)
const RECORDING = process.env.VISUAL_BASELINE === '1'

test('sweeps every section and reports what it measured', async ({ browser, baseURL }) => {
  await requireServedApp(baseURL ?? '')
  await ensureAnalyst(browser, baseURL ?? '')
    await ensureCase(browser, baseURL ?? '')

  const say = (line: string): void => {
    process.stdout.write(`${line}\n`)
  }
  say(`driving ${baseURL ?? '?'} - nothing seeded, nothing removed`)

  const report = await sweep(browser, { out: CURRENT, grounds: GROUNDS, only: ONLY })
  say(`\n${String(report.captures)} screenshots in ${CURRENT}`)

  if (RECORDING) {
    await rm(BASELINE, { recursive: true, force: true })
    await mkdir(dirname(BASELINE), { recursive: true })
    await cp(CURRENT, BASELINE, { recursive: true })
    say(`recorded as the baseline in ${BASELINE}`)
  } else {
    const compared = await compare(BASELINE, CURRENT)
    if (compared.length === 0) {
      // **Said in these words on purpose.** "No view differs" is also what an
      // empty baseline says, and that reads as reassurance rather than as a
      // gap - measured on the Python tier, where a baseline of 80 views became
      // 16 and the next sweep reported no differences while holding none of
      // them.
      say('no baseline recorded - run with VISUAL_BASELINE=1 before a change')
    } else {
      // **`ratio === null` is its own case, not a zero.** `?? 0` dropped an
      // undecodable capture out of this list while still counting it in the
      // total, so a truncated PNG printed as `none of the 66 views differs` -
      // the empty-set-reads-as-reassurance shape this file's own comments are
      // about.
      const moved = compared.filter((one) => one.missing || one.ratio === null || one.ratio > 0)
      say(
        moved.length === 0
          ? `\nnone of the ${String(compared.length)} views differs from the baseline`
          : `\n${String(moved.length)} of ${String(compared.length)} views differ:`,
      )
      // **A view in the baseline and not in the run.** The mirror of the
      // missing-from-baseline case: a section removed from the rail drops two
      // captures, and without this the sweep says the remaining 64 all match.
      for (const name of await vanished(BASELINE, CURRENT)) {
        say(`  - ${name} - in the baseline, not captured`)
      }
      for (const one of moved) {
        if (one.missing) say(`  ? ${one.name} - not in the baseline`)
        else if (one.ratio === null) say(`  ! ${one.name} - could not be compared`)
        else say(`  ~ ${one.name} - ${(one.ratio * 100).toFixed(2)}% of pixels`)
      }
    }
  }

  if (report.findings.length === 0) {
    say('\nno findings')
  } else {
    say(`\n${String(report.findings.length)} findings:`)
    for (const { where, finding } of report.findings) {
      say(`  ! ${where} - ${finding.kind}: ${finding.detail}  [${finding.what}]`)
    }
  }

  // **Then look at the screenshots.** The probes catch geometry, not
  // judgement: they cannot tell you a chip is the wrong colour or that two
  // buttons read as a segmented control. Read the ones the diff names, and
  // always read one dark capture - that is where token regressions surface.
  say('\nthe probes see geometry, not judgement - open the captures')
})
