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

import { requireStorybook } from './require-storybook.js'
import { STORYBOOK_URL } from './storybook-url.js'

import {
  componentGroup,
  duplicateClusters,
  hashFrame,
  sayCluster,
  type FrameRecord,
} from './frame-oracle.js'
import { armStoryFinished, fromAStaleServer, loadStory } from './storybook-lifecycle.js'
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
/**
 * **Refused here rather than asserted in a test.** Both axes filter to empty
 * on an empty string, and they are the loop heads that declare the tests -- so
 * `VISUAL_GROUNDS=$UNSET` declares none, and an assertion inside a test that
 * does not exist cannot fire. Playwright's own answer is `No tests found`,
 * which does not name the variable that emptied.
 */
if (GROUNDS.length === 0) throw new Error('VISUAL_GROUNDS named no ground to walk')
if (WIDTHS.length === 0) throw new Error('VISUAL_WIDTHS named no width to walk')

const ONLY = process.env['STORYBOOK_STORIES']?.split(',').filter(Boolean)

/**
 * How many tests each ground-and-width probe is split into.
 *
 * Playwright shards tests, so a probe walking every story in one test is one
 * shard's work. Sorted by id first, so an index chunks the same everywhere.
 */
const CHUNKS = Math.max(1, Number(process.env['STORYBOOK_CHUNKS'] ?? '5'))
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
 * Module scope because the summary is printed from a hook rather than after the
 * last story, which is what lets a killed run print anything at all. -> #286
 *
 * **A test timeout is the case this covers, and not every kill** -- Playwright
 * gives the after-hooks their own slot, but a Ctrl-C, `globalTimeout` or a
 * worker out of memory still print nothing.
 */
const report: {
  at: string
  probed: number
  expected: number
  died: string | null
  failures: string[]
  plays: string[]
  found: { where: string; line: string }[]
  frames: FrameRecord[]
} = { at: '', probed: 0, expected: 0, died: null, failures: [], plays: [], found: [], frames: [] }

// **Reset per test rather than trusted to be fresh.** The config runs this
// file once per density project, and module state outlives a single test in a
// worker that serves more than one.
test('a stale server and a broken story are told apart', () => {
  // The two shapes measured on one unchanged tree, beside what a real
  // breakage reads like. Pure, so it costs the tier nothing. -> #887
  expect(
    fromAStaleServer(
      'light Components/Calendar / Default - Failed to fetch dynamically imported module: ' +
        'http://127.0.0.1:6006/src/components/ui/calendar.stories.tsx',
    ),
  ).toBe(true)
  expect(
    fromAStaleServer(
      'light X / Y - page.evaluate: Error: storyFinished never fired within 20000ms',
    ),
  ).toBe(true)
  expect(
    fromAStaleServer(
      "light X / Y - TypeError: Cannot read properties of undefined (reading 'map')",
    ),
  ).toBe(false)
  expect(fromAStaleServer('light X / Y - Objects are not valid as a React child')).toBe(false)
})

test.beforeEach(() => {
  Object.assign(report, {
    at: '',
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
      ` (${report.at})`,
  )

  // Reconciled: #286 records `probed 1788 of 2800` with the arithmetic
  // unexplained, and the run can answer that itself.
  const unaccounted = report.expected - report.probed - report.failures.length - report.plays.length
  if (unaccounted !== 0) {
    say(`    ${String(unaccounted)} renders in no bucket -- neither probed, refused nor a play`)
  }

  if (report.failures.length > 0) {
    say(`\n${String(report.failures.length)} would not render:`)
    for (const one of report.failures) say(`  x ${one}`)
  }

  if (report.plays.length > 0) {
    say(
      `\n${String(report.plays.length)} play function(s) threw, which this tier does not measure:`,
    )
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

  // **Only the shard that captured frames speaks about them.** The oracle is
  // fed at the primary width alone, so the others hold none -- and
  // `duplicateClusters([])` is empty for want of input rather than for want of
  // duplicates, which printed as `no duplicate frames` from a shard that never
  // looked.
  if (report.frames.length > 0) {
    const clusters = duplicateClusters(report.frames)
    if (clusters.length === 0) {
      say(
        whole
          ? '\nno duplicate frames'
          : `\nno duplicate frames${over} -- a partial walk cannot find them`,
      )
    } else {
      say(`\n${String(clusters.length)} group(s) of sibling stories render identical pixels:`)
      for (const cluster of clusters) say(`  = ${sayCluster(cluster)}`)
    }
  }
})

/**
 * One test per ground and width, each with its own budget and its own summary.
 *
 * **A test's timeout is the budget for one test**, and one walk over every
 * axis asks a single budget to cover the whole gallery several times over.
 * Each shard's summary printing as it lands is also the only progress this
 * tier can show, since `list` prints nothing until a test ends.
 *
 * The frame oracle is unaffected: `duplicateClusters` buckets by ground and
 * component group, so no cluster ever spanned two grounds.
 */
for (const ground of GROUNDS) {
  for (const width of WIDTHS) {
    // The width is named only where it is not the primary, so the usual run
    // reads as it always did and a narrow finding stands out as narrow.
    const primary = width === WIDTHS[0]

    for (let chunk = 0; chunk < CHUNKS; chunk += 1) {
      const part = CHUNKS === 1 ? '' : `, ${String(chunk + 1)}/${String(CHUNKS)}`
      test(`probes every Storybook story at ${ground}, ${String(width)}px${part}`, async ({
        browser,
      }) => {
        // Under the job's ceiling: a test timeout prints what it walked, a
        // job killed by its own prints nothing. -> #286
        test.setTimeout(Math.max(10, Math.ceil(30 / CHUNKS)) * 60_000)
        report.at = `${ground} at ${String(width)}px${part}`

        const all = await storyIndex()
        // A null index is the no-Storybook case, so the same helper answers it:
        // a skip while exploring, a refusal on a run that claims to certify.
        if (all === null) await requireStorybook()
        const matched = (all ?? [])
          .filter(
            (one) => ONLY === undefined || ONLY.some((prefix) => one.title.startsWith(prefix)),
          )
          .sort((a, b) => a.id.localeCompare(b.id))

        // Asked of the whole match, not this chunk: more chunks than
        // stories leaves the later ones legitimately empty.
        expect(matched.length, 'the index matched no story').toBeGreaterThan(0)

        const stories = matched.filter((_, at) => at % CHUNKS === chunk)

        report.expected = stories.length

        const viewport = { width, height: DEFAULT_VIEWPORT.height }
        const context = await browser.newContext({
          viewport,
          colorScheme: ground === 'dark' ? 'dark' : 'light',
          reducedMotion: 'reduce',
        })
        const page = await context.newPage()
        await armStoryFinished(page)

        for (const story of stories) {
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

        // The one thing this tier asserts: it could look. A story that will not
        // render is a fact about the tree, and a reporting run that quietly probed
        // nothing is indistinguishable from a clean one.
        //
        // **Split by what the failure is about, because the two read identically and
        // are not the same finding.** A long-lived dev Storybook hands the browser
        // module URLs from before its last re-optimisation, and what comes back
        // names the component -- 31 date and time stories in one measured run, all
        // of which rendered after a restart of the server and nothing else. Reported
        // together, a stale server looks exactly like a broken tree, and the run
        // costs its reader a search through the tree for a fault that is not there.
        // Both still fail the run. -> #887
        const stale = report.failures.filter((one) => fromAStaleServer(one))
        const broken = report.failures.filter((one) => !fromAStaleServer(one))
        expect(broken, 'these stories could not be probed').toEqual([])
        expect(
          stale,
          'the Storybook serving these did not hand over their modules, which is the server rather ' +
            'than the tree: restart it and walk again. A story that stays here across a restart is ' +
            'the tree after all.',
        ).toEqual([])
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
    }
  }
}
