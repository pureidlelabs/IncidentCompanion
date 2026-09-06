/**
 * `npm run visual` - every rail section, both grounds, captured and probed.
 *
 * **It reports; it does not assert**, which is the split from every spec
 * beside it. `sections.spec.ts` fails a section that will not open; a position
 * you are prepared to defend belongs there. Most findings here are a judgement
 * call, and a run that failed the tier on "this chip is 2.9:1" would be
 * disabled inside a week.
 *
 * **So the one thing it does fail on is the sweep not completing** - a section
 * that never quiesces, a ground that would not take. Those are facts about the
 * app, and a capture taken anyway is the mid-transition measurement the probes
 * exist to avoid.
 *
 * **It drives a stack that is already running**, which is `./dev-node.sh` for
 * this worktree - the URL comes from `server/scripts/stack.mjs`, so a worktree
 * sweeps its own app rather than a hardcoded port.
 *
 * Options are environment variables because Playwright owns argv:
 *
 * ```bash
 * npm run visual                                  # light + dark, every section
 * VISUAL_BASELINE=1 npm run visual                # record, before a change
 * VISUAL_SECTIONS=timeline,report npm run visual  # slugs, not titles
 * VISUAL_GROUNDS=dark npm run visual
 * ```
 */
import { cp, mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { test } from '@playwright/test'

import { ensureAnalyst, ensureCase, requireServedApp } from '../support/app.js'

import { compare, vanished } from './baseline.js'
import { sweep } from './sweep.js'
import type { Ground } from './view.js'

/**
 * **`__dirname`, not `import.meta`.** Playwright loads a spec through a
 * CommonJS wrapper whatever the extension says, so `import.meta.url` throws
 * *"Cannot use 'import.meta' outside a module"* before a single test is
 * collected - and the run then reports **"No tests found"**, which reads as a
 * bad `testMatch` rather than as a syntax error.
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
      // gap.
      say('no baseline recorded - run with VISUAL_BASELINE=1 before a change')
    } else {
      // **`ratio === null` is its own case, not a zero.** A `?? 0` drops an
      // undecodable capture out of this list while still counting it in the
      // total, so a truncated PNG prints as none of the views differing - the
      // empty-set-reads-as-reassurance shape this file's own comments are about.
      const moved = compared.filter((one) => one.missing || one.ratio === null || one.ratio > 0)
      say(
        moved.length === 0
          ? `\nnone of the ${String(compared.length)} views differs from the baseline`
          : `\n${String(moved.length)} of ${String(compared.length)} views differ:`,
      )
      // **A view in the baseline and not in the run.** The mirror of the
      // missing-from-baseline case: a section removed from the rail drops two
      // captures, and without this the sweep says the remaining ones all match.
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
