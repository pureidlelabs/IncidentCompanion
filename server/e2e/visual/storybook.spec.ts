/**
 * Every Storybook story, probed for the defects no other tier can perceive.
 *
 * `probe.js` measures the class no other tier can -- contrast, clipping,
 * overlap, offscreen, hit-area, horizontal scroll. Storybook is where every
 * state of every component exists at once, which makes it a better target
 * than the running app: the app shows the states a demo case happens to
 * produce, this shows the ones somebody wrote down.
 *
 * **It reports; it does not assert.** Same split as `sweep.spec.ts`, for the
 * same reason: most findings are a judgement call, and a tier that failed on
 * "this chip is 2.9:1" would be switched off inside a week. What it fails on is
 * not being able to probe -- a story that never renders is a fact, not a taste.
 *
 * **It needs a Storybook**, and skips with a reason when there is none, exactly
 * as the browser tier skips without a built `ui/dist`.
 *
 * ```bash
 * cd ui && npm run storybook          # in another shell, first
 * npx playwright test e2e/visual/storybook.spec.ts
 *
 * STORYBOOK_STORIES=Blocks,Layouts npx playwright test e2e/visual/storybook.spec.ts
 * VISUAL_GROUNDS=dark npx playwright test e2e/visual/storybook.spec.ts
 * ```
 *
 * **Reduced motion, deliberately.** A travelling `layoutId` ground photographs
 * mid-flight under a label that has already taken its selected colour, which
 * reads exactly like a contrast defect and is not one. The app honours the
 * preference through `MotionConfig reducedMotion="user"`, so this measures the
 * settled state rather than a suppressed one.
 *
 * **A reading is stable when three probe passes 400ms apart agree**, which is
 * `findings()`'s contract. Its internal `settle` does nothing here: it
 * fingerprints `main *`, and a Storybook iframe has no `<main>`.
 *
 * Frames are captured through `storybook-lifecycle.ts`'s `loadStory`, which
 * waits for `play` to finish, and hashed for `frame-oracle.ts`.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { expect, test } from '@playwright/test'

import { STORYBOOK_URL } from './storybook-url.js'

import { componentGroup, duplicateClusters, hashFrame, sayCluster, type FrameRecord } from './frame-oracle.js'
import { armStoryFinished, loadStory } from './storybook-lifecycle.js'
import { findings, sayFinding, type Ground } from './view.js'

const SB = STORYBOOK_URL
const DEFAULT_VIEWPORT = { width: 1440, height: 900 }

/**
 * The widths every story is probed at.
 *
 * **A second width, because one viewport cannot see a width-dependent
 * defect.** Two badges sharing a table cell needed 155px in a column that is
 * 15% of the pane: 209px at 1440 and 111px by 900, so the pair spilled into
 * the neighbouring column at every width below about 1200 and at none the
 * sweep looked at. Half of 1440 is the cheapest second reading that is not
 * simply the first one again.
 *
 * The first entry is the primary: it is what the frame oracle compares, since
 * one story at two widths is two different frames and pairing them would
 * report every story in the run as its own duplicate.
 */
const WIDTHS = (process.env['VISUAL_WIDTHS'] ?? '1440,720')
  .split(',')
  .map((one) => Number.parseInt(one.trim(), 10))
  .filter((one) => Number.isFinite(one) && one > 0)

const GROUNDS = (process.env['VISUAL_GROUNDS'] ?? 'light,dark')
  .split(',')
  .filter(Boolean) as Ground[]
const ONLY = process.env['STORYBOOK_STORIES']?.split(',').filter(Boolean)
const SHOTS = process.env['STORYBOOK_SHOTS']

interface Entry {
  id: string
  title: string
  name: string
  type: string
  componentPath?: string
}

/** The story index, or null when no Storybook is listening. */
async function storyIndex(): Promise<Entry[] | null> {
  try {
    const answer = await fetch(`${SB}/index.json`, { signal: AbortSignal.timeout(5_000) })
    if (!answer.ok) return null
    const body = (await answer.json()) as { entries?: Record<string, Entry> }
    return Object.values(body.entries ?? {}).filter((one) => one.type === 'story')
  } catch {
    return null
  }
}

/**
 * What the walk has seen so far, readable after its own timeout kills it.
 *
 * Module scope because the summary is printed from a hook: every line used to
 * be written after the last story, so a killed run printed nothing. -> #286
 *
 * **A test timeout is the case this covers, and not every kill** -- Playwright
 * gives the after-hooks their own slot, but a Ctrl-C, `globalTimeout` or a
 * worker out of memory still print nothing.
 */
const report: {
  probed: number
  expected: number
  died: string | null
  failures: string[]
  plays: string[]
  found: { where: string; line: string }[]
  frames: FrameRecord[]
} = { probed: 0, expected: 0, died: null, failures: [], plays: [], found: [], frames: [] }

// **Reset per test rather than trusted to be fresh.** The config runs this
// file once per density project, and module state outlives a single test in a
// worker that serves more than one.
test.beforeEach(() => {
  Object.assign(report, {
    probed: 0,
    expected: 0,
    died: null,
    failures: [],
    plays: [],
    found: [],
    frames: [],
  })
})

function say(line: string): void {
  process.stdout.write(`${line}\n`)
}

/**
 * Prints everything the walk gathered, whether or not it reached the end.
 *
 * A hook rather than the walk's own last lines: Playwright runs this after a
 * test that timed out, which is the case the walk cannot write from.
 */
test.afterEach(() => {
  if (report.expected === 0) return
  const whole = report.probed === report.expected
  say(
    `\nprobed ${String(report.probed)} of ${String(report.expected)} story renders` +
      ` (${GROUNDS.join(', ')} at ${WIDTHS.map((one) => String(one)).join(', ')}px)`,
  )

  // Reconciled: #286 records `probed 1788 of 2800` with the arithmetic
  // unexplained, and the run can answer that itself.
  const unaccounted =
    report.expected - report.probed - report.failures.length - report.plays.length
  if (unaccounted !== 0) {
    say(`    ${String(unaccounted)} renders in no bucket -- neither probed, refused nor a play`)
  }

  if (report.failures.length > 0) {
    say(`\n${String(report.failures.length)} would not render:`)
    for (const one of report.failures) say(`  x ${one}`)
  }

  if (report.plays.length > 0) {
    say(`\n${String(report.plays.length)} play function(s) threw, which this tier does not measure:`)
    for (const one of report.plays) say(`  ~ ${one}`)
  }

  // **A negative is only a negative over what was walked.** On a run cut short
  // `no findings` is a claim about the gallery made from a fraction of it, and
  // the duplicate line is worse -- pairing by hash can only under-report when
  // the partners were never reached.
  const over = whole ? '' : ` in the ${String(report.probed)} probed`
  if (report.found.length === 0) {
    say(`\nno findings${over}`)
  } else {
    say(`\n${String(report.found.length)} findings:`)
    for (const { where, line } of report.found) say(`  ! ${where} - ${line}`)
  }

  const clusters = duplicateClusters(report.frames)
  if (clusters.length === 0) {
    say(whole ? '\nno duplicate frames' : `\nno duplicate frames${over} -- a partial walk cannot find them`)
  } else {
    say(`\n${String(clusters.length)} group(s) of sibling stories render identical pixels:`)
    for (const cluster of clusters) say(`  = ${sayCluster(cluster)}`)
  }
})

test('probes every Storybook story and reports what it measured', async ({ browser }) => {
  // Long: every story, three probe passes each, times the grounds.
  test.setTimeout(30 * 60_000)

  const all = await storyIndex()
  test.skip(all === null, `no Storybook at ${SB} - run \`cd ui && npm run storybook\` first`)
  const stories = (all ?? [])
    .filter((one) => ONLY === undefined || ONLY.some((prefix) => one.title.startsWith(prefix)))
    .sort((a, b) => a.id.localeCompare(b.id))

  // A run over nothing is the failure mode a reporting tier hides best.
  expect(stories.length, 'the index matched no story').toBeGreaterThan(0)
  // The same failure on the other two axes: both filter to empty on an empty
  // string, so `VISUAL_GROUNDS=$UNSET` walks nothing and passes green.
  expect(GROUNDS.length, 'VISUAL_GROUNDS named no ground to walk').toBeGreaterThan(0)
  expect(WIDTHS.length, 'VISUAL_WIDTHS named no width to walk').toBeGreaterThan(0)

  report.expected = stories.length * GROUNDS.length * WIDTHS.length


  for (const ground of GROUNDS) {
   for (const width of WIDTHS) {
    const viewport = { width, height: DEFAULT_VIEWPORT.height }
    const primary = width === WIDTHS[0]
    const context = await browser.newContext({
      viewport,
      colorScheme: ground === 'dark' ? 'dark' : 'light',
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    await armStoryFinished(page)

    for (const story of stories) {
      // The width is named only where it is not the primary, so the usual run
      // reads as it always did and a narrow finding stands out as narrow.
      const at = primary ? '' : ` @${String(width)}`
      const where = `${ground}${at} ${story.title} / ${story.name}`
      try {
        // Undoes a previous story's `viewport` global before this one's own
        // load decides whether it needs one -- `loadStory` only resizes when
        // a story asks for it, so a page left narrow from the last story
        // would otherwise capture this one narrow too.
        await page.setViewportSize(viewport)
        const { broke, playError } = await loadStory(page, SB, story.id, ground)
        if (broke !== null) {
          report.failures.push(`${where} - ${broke}`)
          continue
        }
        // A story whose `play` threw has not reached the state it is named
        // for, so its frame is of something else. Reported rather than
        // captured -- hashing it feeds the oracle a state nothing asked for.
        //
        // **Not a failure, because it is not this tier's measurement.** This
        // tier fails on not being able to *probe*, and a red run for a reason
        // it did not measure teaches its reader to skim the failure line.
        // -> #191
        //
        // **A demotion rather than a handover.** The story tier is a CI gate,
        // so an ordinary play regression still goes red -- but it runs each
        // story once, light ground, default viewport. A play that throws only
        // in dark or at the narrow width is printed here and asserted nowhere.
        if (playError !== null) {
          report.plays.push(`${where} - play threw: ${playError.split('\n')[0] ?? ''}`)
          continue
        }
        for (const one of await findings(page))
          report.found.push({ where, line: sayFinding(one) })
        // One capture serves both the oracle and `STORYBOOK_SHOTS` -- a
        // second `page.screenshot()` here would double the run's cost across
        // every story render for a file nobody asked for.
        const png = await page.screenshot()
        // The oracle pairs stories that render identically, so it is fed one
        // width: the same story at two widths is two frames, and every story
        // in the run would pair with itself.
        if (primary) {
          report.frames.push({
            ground,
            group: componentGroup(story.componentPath, story.title),
            title: story.title,
            name: story.name,
            hash: hashFrame(png),
          })
        }
        if (SHOTS !== undefined) {
          const safe = story.id.replace(/[^\w.-]/g, '_')
          const path = `${SHOTS}/${ground}-${String(width)}-${safe}.png`
          mkdirSync(dirname(path), { recursive: true })
          writeFileSync(path, png)
        }
        report.probed += 1
      } catch (error) {
        const why = error instanceof Error ? (error.message.split('\n')[0] ?? '') : ''
        // **A dead server is one fact, not one per story.** A connection refused
        // mid-sweep otherwise reports every remaining story as broken, which
        // reads as a catastrophe in the tree rather than as the one thing that
        // happened.
        if (why.includes('ERR_CONNECTION_REFUSED')) {
          report.died = `${SB} stopped answering at "${where}" -- probed ${String(report.probed)} first`
          break
        }
        report.failures.push(`${where} - ${why}`)
      }
    }

    await context.close()
    if (report.died !== null) break
   }
   if (report.died !== null) break
  }

  // The one thing this tier asserts: it could look. A story that will not
  // render is a fact about the tree, and a reporting run that quietly probed
  // nothing is indistinguishable from a clean one.
  expect(report.failures, 'these stories could not be probed').toEqual([])
  // A floor under the demotion: every play throwing is indistinguishable from
  // plays no longer running.
  expect(
    report.plays.length,
    'every render reported a thrown play, which is plays not running rather than plays being timing-sensitive',
  ).toBeLessThan(report.expected)
  // Asserted after the failures, and both after the hook has already printed
  // everything the walk saw.
  expect(report.died, 'the sweep did not finish').toBeNull()
})
