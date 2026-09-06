/**
 * Proves the oracle names a planted pair, and proves its capture point sees
 * a `play` function.
 *
 * **A tier that reports clean when it cannot see is indistinguishable from
 * one that looked and found nothing.** Both tests plant a story file and
 * capture it through `loadStory` -- the function `storybook.spec.ts` itself
 * calls, not a second copy of its navigation -- so a capture point that
 * regresses is caught here rather than in a silent sweep.
 *
 * Both plants are deleted in a `finally`. Needs the same Storybook
 * `storybook.spec.ts` needs, and skips the same way.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from '@playwright/test'

import { STORYBOOK_URL } from './storybook-url.js'

import { componentGroup, duplicateClusters, hashFrame, type FrameRecord } from './frame-oracle.js'
import { armStoryFinished, loadStory } from './storybook-lifecycle.js'

const SB = STORYBOOK_URL

// **`__dirname`, not `import.meta`.** Playwright loads a spec through a
// CommonJS wrapper whatever the extension says, so `import.meta.url` throws
// *"Cannot use 'import.meta' outside a module"* before a single test is
// collected. Two directories up from `server/e2e/visual/` is the repo root
// that also holds `ui/`.
const DUPLICATE_PLANT_PATH = path.join(
  __dirname,
  '../../../ui/src/components/ui/__frame-oracle-selftest__.stories.tsx',
)
const PLAY_PLANT_PATH = path.join(
  __dirname,
  '../../../ui/src/components/ui/__frame-oracle-play-selftest__.stories.tsx',
)
const THREW_PLANT_PATH = path.join(
  __dirname,
  '../../../ui/src/components/ui/__frame-oracle-threw-selftest__.stories.tsx',
)

const DUPLICATE_PLANT_SOURCE = `/**
 * Planted by frame-oracle.storybook.spec.ts's own self-test and deleted at
 * the end of that run. Two exports rendering the same markup on purpose --
 * if this file survived a run, the test crashed before its cleanup ran and
 * it is safe to delete by hand.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

function FrameOracleSelftestSubject(): React.JSX.Element {
  return <div style={{ padding: 16, background: '#334', color: '#fff' }}>frame-oracle selftest</div>
}

const meta = {
  title: 'Selftest/Frame Oracle Plant',
  component: FrameOracleSelftestSubject,
} satisfies Meta<typeof FrameOracleSelftestSubject>

export default meta
type Story = StoryObj<typeof meta>

export const PlantedOne: Story = {}

export const PlantedTwo: Story = {}
`

const PLAY_PLANT_SOURCE = `/**
 * Planted by frame-oracle.storybook.spec.ts's own self-test and deleted at
 * the end of that run. Two exports rendering identical markup at first
 * paint -- one of them mutates it in \`play\`, after the frame this file's
 * self-test captures.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

function FrameOraclePlaySelftestSubject(): React.JSX.Element {
  return (
    <div data-testid="frame-oracle-play-selftest" style={{ padding: 16, background: '#334', color: '#fff' }}>
      before
    </div>
  )
}

const meta = {
  title: 'Selftest/Frame Oracle Play Plant',
  component: FrameOraclePlaySelftestSubject,
} satisfies Meta<typeof FrameOraclePlaySelftestSubject>

export default meta
type Story = StoryObj<typeof meta>

export const Base: Story = {}

export const AfterPlay: Story = {
  play: async ({ canvasElement }) => {
    const node = canvasElement.querySelector('[data-testid="frame-oracle-play-selftest"]')
    if (node) node.textContent = 'after'
  },
}
`

const THREW_PLANT_SOURCE = `/**
 * Planted by frame-oracle.storybook.spec.ts's own self-test and deleted at
 * the end of that run. One export asserts something true and one asserts
 * something false, so a run can tell the two apart.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

function FrameOracleThrewSelftestSubject(): React.JSX.Element {
  return <div style={{ padding: 16 }}>threw selftest</div>
}

const meta = {
  title: 'Selftest/Frame Oracle Threw Plant',
  component: FrameOracleThrewSelftestSubject,
} satisfies Meta<typeof FrameOracleThrewSelftestSubject>

export default meta
type Story = StoryObj<typeof meta>

export const Held: Story = {
  play: () => {
    expect(1).toBe(1)
  },
}

export const DidNotHold: Story = {
  play: () => {
    expect(1).toBe(2)
  },
}
`

async function waitForStorybookEntries(
  title: string,
  timeoutMs = 20_000,
): Promise<{ id: string; name: string }[]> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      const answer = await fetch(`${SB}/index.json`, { signal: AbortSignal.timeout(5_000) })
      if (answer.ok) {
        const body = (await answer.json()) as {
          entries?: Record<string, { id: string; type: string; title: string; name: string }>
        }
        const matched = Object.values(body.entries ?? {}).filter(
          (one) => one.type === 'story' && one.title === title,
        )
        if (matched.length >= 2) return matched
      }
    } catch {
      // Storybook restarting its index server mid-poll: retry below.
    }
    if (Date.now() > deadline) {
      throw new Error(`Storybook never indexed '${title}' within ${String(timeoutMs)}ms`)
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
}

test('names a planted pair of identically-rendering stories', async ({ browser }) => {
  test.setTimeout(60_000)

  const probe = await fetch(`${SB}/index.json`, { signal: AbortSignal.timeout(5_000) }).catch(
    () => null,
  )
  test.skip(probe === null || !probe.ok, `no Storybook at ${SB} - run \`cd ui && npm run storybook\` first`)

  mkdirSync(path.dirname(DUPLICATE_PLANT_PATH), { recursive: true })
  writeFileSync(DUPLICATE_PLANT_PATH, DUPLICATE_PLANT_SOURCE)

  try {
    const entries = await waitForStorybookEntries('Selftest/Frame Oracle Plant')

    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: 'light',
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    await armStoryFinished(page)

    const frames: FrameRecord[] = []
    for (const entry of entries) {
      await loadStory(page, SB, entry.id, 'light')
      const png = await page.screenshot()
      frames.push({
        ground: 'light',
        group: componentGroup(undefined, 'Selftest/Frame Oracle Plant'),
        title: 'Selftest/Frame Oracle Plant',
        name: entry.name,
        hash: hashFrame(png),
      })
    }
    await context.close()

    // Two unrelated frames from the live gallery are the negative control:
    // the oracle must not pair stories that only share a ground, and this is
    // what would fail silent if `duplicateClusters` grouped on ground alone.
    frames.push({
      ground: 'light',
      group: 'a different component entirely',
      title: 'Not the plant',
      name: 'Unrelated',
      hash: hashFrame(Buffer.from('not a real frame, just a distinct hash input')),
    })

    const clusters = duplicateClusters(frames)
    expect(clusters, 'the planted pair renders identical pixels and must be named').toHaveLength(1)
    expect(clusters[0]?.stories.sort()).toEqual(
      ['Selftest/Frame Oracle Plant / Planted One', 'Selftest/Frame Oracle Plant / Planted Two'].sort(),
    )
  } finally {
    rmSync(DUPLICATE_PLANT_PATH, { force: true })
  }
})

test('does not pair a story with its sibling once play has run', async ({ browser }) => {
  test.setTimeout(60_000)

  const probe = await fetch(`${SB}/index.json`, { signal: AbortSignal.timeout(5_000) }).catch(
    () => null,
  )
  test.skip(probe === null || !probe.ok, `no Storybook at ${SB} - run \`cd ui && npm run storybook\` first`)

  mkdirSync(path.dirname(PLAY_PLANT_PATH), { recursive: true })
  writeFileSync(PLAY_PLANT_PATH, PLAY_PLANT_SOURCE)

  try {
    const entries = await waitForStorybookEntries('Selftest/Frame Oracle Play Plant')

    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: 'light',
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    await armStoryFinished(page)

    const frames: FrameRecord[] = []
    for (const entry of entries) {
      await loadStory(page, SB, entry.id, 'light')
      const png = await page.screenshot()
      frames.push({
        ground: 'light',
        group: componentGroup(undefined, 'Selftest/Frame Oracle Play Plant'),
        title: 'Selftest/Frame Oracle Play Plant',
        name: entry.name,
        hash: hashFrame(png),
      })
    }
    await context.close()

    // Captured before `play` ran, `Base` and `AfterPlay` render byte-identical
    // markup and this would report one cluster -- the exact false duplicate
    // `loadStory`'s `storyFinished` wait exists to prevent.
    const clusters = duplicateClusters(frames)
    expect(
      clusters,
      "'play' mutates AfterPlay's frame; it must not hash the same as its sibling's",
    ).toHaveLength(0)
  } finally {
    rmSync(PLAY_PLANT_PATH, { force: true })
  }
})

/**
 * The sweep's own instrument, checked against a story that fails on purpose.
 *
 * `storyFinished` resolves `status: 'success'` for a `play` that threw, so a
 * story asserting anything is certified by a field that cannot say no. What
 * this holds is that the replacement signal still tells the two apart.
 */
test('reports a play function whose assertion did not hold', async ({ browser }) => {
  test.setTimeout(60_000)

  const probe = await fetch(`${SB}/index.json`, { signal: AbortSignal.timeout(5_000) }).catch(
    () => null,
  )
  test.skip(probe === null || !probe.ok, `no Storybook at ${SB} - run \`cd ui && npm run storybook\` first`)

  mkdirSync(path.dirname(THREW_PLANT_PATH), { recursive: true })
  writeFileSync(THREW_PLANT_PATH, THREW_PLANT_SOURCE)

  try {
    const entries = await waitForStorybookEntries('Selftest/Frame Oracle Threw Plant')

    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: 'light',
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    await armStoryFinished(page)

    const seen = new Map<string, string | null>()
    for (const entry of entries) {
      const { playError } = await loadStory(page, SB, entry.id, 'light')
      seen.set(entry.name, playError)
    }
    await context.close()

    expect(seen.get('Held'), 'a play whose assertion held must report nothing').toBeNull()
    expect(
      seen.get('Did Not Hold'),
      'a play whose assertion failed must not read as a story that passed',
    ).toContain('expected 1 to be 2')
  } finally {
    rmSync(THREW_PLANT_PATH, { force: true })
  }
})
