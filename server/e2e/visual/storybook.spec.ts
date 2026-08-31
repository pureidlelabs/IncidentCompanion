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

import { componentGroup, duplicateClusters, hashFrame, sayCluster, type FrameRecord } from './frame-oracle.js'
import { armStoryFinished, loadStory } from './storybook-lifecycle.js'
import { findings, sayFinding, type Ground } from './view.js'

const SB = process.env['STORYBOOK_URL'] ?? 'http://localhost:6006'
const DEFAULT_VIEWPORT = { width: 1440, height: 900 }
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

  const say = (line: string): void => {
    process.stdout.write(`${line}\n`)
  }

  let probed = 0
  let died: string | null = null
  const failures: string[] = []
  const found: { where: string; line: string }[] = []
  const frames: FrameRecord[] = []

  for (const ground of GROUNDS) {
    const context = await browser.newContext({
      viewport: DEFAULT_VIEWPORT,
      colorScheme: ground === 'dark' ? 'dark' : 'light',
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    await armStoryFinished(page)

    for (const story of stories) {
      const where = `${ground} ${story.title} / ${story.name}`
      try {
        // Undoes a previous story's `viewport` global before this one's own
        // load decides whether it needs one -- `loadStory` only resizes when
        // a story asks for it, so a page left narrow from the last story
        // would otherwise capture this one narrow too.
        await page.setViewportSize(DEFAULT_VIEWPORT)
        const { broke } = await loadStory(page, SB, story.id, ground)
        if (broke !== null) {
          failures.push(`${where} - ${broke}`)
          continue
        }
        for (const one of await findings(page)) found.push({ where, line: sayFinding(one) })
        // One capture serves both the oracle and `STORYBOOK_SHOTS` -- a
        // second `page.screenshot()` here would double the run's cost across
        // every story render for a file nobody asked for.
        const png = await page.screenshot()
        frames.push({
          ground,
          group: componentGroup(story.componentPath, story.title),
          title: story.title,
          name: story.name,
          hash: hashFrame(png),
        })
        if (SHOTS !== undefined) {
          const safe = story.id.replace(/[^\w.-]/g, '_')
          const path = `${SHOTS}/${ground}-${safe}.png`
          mkdirSync(dirname(path), { recursive: true })
          writeFileSync(path, png)
        }
        probed += 1
      } catch (error) {
        const why = error instanceof Error ? (error.message.split('\n')[0] ?? '') : ''
        // **A dead server is one fact, not one per story.** Storybook ran out
        // of memory mid-sweep once and the run reported 1,191 stories as
        // broken, which reads as a catastrophe in the tree rather than as the
        // one thing that happened.
        if (why.includes('ERR_CONNECTION_REFUSED')) {
          died = `${SB} stopped answering at "${where}" -- probed ${String(probed)} first`
          break
        }
        failures.push(`${where} - ${why}`)
      }
    }

    await context.close()
    if (died !== null) break
  }

  say(`\nprobed ${String(probed)} of ${String(stories.length * GROUNDS.length)} story renders`)

  if (failures.length > 0) {
    say(`\n${String(failures.length)} would not render:`)
    for (const one of failures) say(`  x ${one}`)
  }

  if (found.length === 0) {
    say('\nno findings')
  } else {
    say(`\n${String(found.length)} findings:`)
    for (const { where, line } of found) say(`  ! ${where} - ${line}`)
  }

  const clusters = duplicateClusters(frames)
  if (clusters.length === 0) {
    say('\nno duplicate frames')
  } else {
    say(`\n${String(clusters.length)} group(s) of sibling stories render identical pixels:`)
    for (const cluster of clusters) say(`  = ${sayCluster(cluster)}`)
  }

  // The one thing this tier asserts: it could look. A story that will not
  // render is a fact about the tree, and a reporting run that quietly probed
  // nothing is indistinguishable from a clean one.
  expect(failures, 'these stories could not be probed').toEqual([])
  // Reported after the findings, so a partial run still hands over what it did
  // see before saying it was cut short.
  expect(died, 'the sweep did not finish').toBeNull()
})
