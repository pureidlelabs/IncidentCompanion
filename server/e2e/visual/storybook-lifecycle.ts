/**
 * Loads one Storybook story into `iframe.html` and waits for what the probe
 * actually needs: not the first paint, but the story's own `play` function
 * (if it has one) having finished, and its `viewport` global applied to the
 * page that is about to be screenshotted.
 */
import type { Page } from '@playwright/test'
import { MINIMAL_VIEWPORTS } from 'storybook/viewport'

import { quiesce } from './view.js'

export interface StoryFinishedPayload {
  storyId: string
  status: 'error' | 'success'
}

interface StorybookChannel {
  once: (event: string, listener: (payload: StoryFinishedPayload) => void) => void
  on: (event: string, listener: (payload: { message?: string }) => void) => void
}

interface StorybookPreview {
  selectionStore: { selection: { storyId: string } | null }
  storyRenders: { id: string; story: unknown }[]
  storyStoreValue: { getStoryContext: (story: unknown) => { globals: Record<string, unknown> } }
}

declare global {
  interface Window {
    __frameOracleStoryFinished?: Promise<StoryFinishedPayload>
    __frameOraclePlayError?: string | null
    __STORYBOOK_ADDONS_CHANNEL__?: StorybookChannel
    __STORYBOOK_PREVIEW__?: StorybookPreview
  }
}

const DEFAULT_FINISH_TIMEOUT_MS = 20_000

/**
 * Arms the `storyFinished` listener before any navigation on this page.
 */
export async function armStoryFinished(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__frameOraclePlayError = null
    window.__frameOracleStoryFinished = new Promise((resolve) => {
      const attach = (): void => {
        const channel = window.__STORYBOOK_ADDONS_CHANNEL__
        if (!channel) {
          setTimeout(attach, 15)
          return
        }
        // **The event `storyFinished`'s status does not carry.** Measured on
        // this Storybook: a `play` whose `expect` is false, and one that
        // throws outright, both finish `status: 'success'`, and both emit this
        // with the message. Keeping the first is enough -- a `play` stops at
        // its first throw.
        channel.on('playFunctionThrewException', (thrown) => {
          window.__frameOraclePlayError ??=
            typeof thrown.message === 'string' ? thrown.message : 'play threw a value with no message'
        })
        channel.once('storyFinished', resolve)
      }
      attach()
    })
  })
}

/**
 * Waits for the current story's `storyFinished`.
 *
 * Throws on timeout, which callers report the same way as a story that would
 * not render at all -- a `play` function that never settles is a fact about
 * the tree, not something a longer wait should paper over.
 */
export async function waitForStoryFinished(
  page: Page,
  timeoutMs = DEFAULT_FINISH_TIMEOUT_MS,
): Promise<StoryFinishedPayload> {
  return page.evaluate((timeout) => {
    const armed = window.__frameOracleStoryFinished
    if (!armed) throw new Error('storyFinished was never armed - call armStoryFinished first')
    return Promise.race([
      armed,
      new Promise<StoryFinishedPayload>((_resolve, reject) =>
        setTimeout(
          () => reject(new Error(`storyFinished never fired within ${String(timeout)}ms`)),
          timeout,
        ),
      ),
    ])
  }, timeoutMs)
}

function isKnownViewport(value: string): value is keyof typeof MINIMAL_VIEWPORTS {
  return value in MINIMAL_VIEWPORTS
}

/** `"414px"` to `414`; anything not a bare pixel count is left unresolved. */
function parsePixels(dimension: string): number | null {
  const match = /^(\d+)px$/.exec(dimension)
  return match ? Number(match[1]) : null
}

/** The current story's resolved `globals.viewport.value`, or none set. */
async function currentViewportGlobal(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const preview = window.__STORYBOOK_PREVIEW__
    const storyId = preview?.selectionStore.selection?.storyId
    if (preview === undefined || storyId === undefined) return null
    const render = preview.storyRenders.find((one) => one.id === storyId)
    if (!render) return null
    const context = preview.storyStoreValue.getStoryContext(render.story)
    const viewport = context.globals['viewport']
    if (viewport === null || typeof viewport !== 'object') return null
    const value = (viewport as { value?: unknown }).value
    return typeof value === 'string' ? value : null
  })
}

/**
 * Resizes the page to the story's own `viewport` global, if it named one
 * `MINIMAL_VIEWPORTS` carries in pixels.
 */
export async function applyStoryViewport(page: Page): Promise<{ width: number; height: number } | null> {
  const value = await currentViewportGlobal(page)
  if (value === null || !isKnownViewport(value)) return null
  const { styles } = MINIMAL_VIEWPORTS[value]
  const width = parsePixels(styles.width)
  const height = parsePixels(styles.height)
  if (width === null || height === null) return null
  await page.setViewportSize({ width, height })
  return { width, height }
}

export interface StoryLoad {
  /** The first line of Storybook's own error page, or `null` when it rendered. */
  broke: string | null
  /** What `play` threw, or `null` when it did not. Never read from the finish status. */
  playError: string | null
}

/**
 * Navigates to one story's standalone preview and waits until it has genuinely
 * finished -- `play` included -- applying its `viewport` global along the way.
 */
export async function loadStory(
  page: Page,
  storybookUrl: string,
  storyId: string,
  ground: string,
): Promise<StoryLoad> {
  await page.goto(`${storybookUrl}/iframe.html?id=${storyId}&viewMode=story`, {
    waitUntil: 'load',
    timeout: 20_000,
  })
  await page.evaluate((one) => {
    document.documentElement.setAttribute('data-theme', one)
  }, ground)
  // **`attached`, not the default `visible`.** Several stories draw nothing
  // on purpose, and an empty root has no box -- `visible` fails them for
  // succeeding.
  await page.locator('#storybook-root').waitFor({ state: 'attached', timeout: 10_000 })
  // Storybook renders its own error page into the document rather than
  // throwing, so a story that will not load looks like a story that drew
  // nothing.
  const broke = await page.locator('#error-message').textContent({ timeout: 1_000 })
  if (broke !== null && broke.trim() !== '') {
    return { broke: broke.trim().split('\n')[0] ?? '', playError: null }
  }
  await waitForStoryFinished(page)
  const playError = await page.evaluate(() => window.__frameOraclePlayError ?? null)
  const resized = await applyStoryViewport(page)
  // A resize is a relayout, not a rerender -- `quiesce`'s own settle is a
  // near no-op on a Storybook iframe (there is no `<main>` for its
  // fingerprint to read), but its poll tick is still one beat of margin for
  // anything that reacts to size via `ResizeObserver` rather than CSS alone.
  if (resized) await quiesce(page)
  return { broke: null, playError }
}
