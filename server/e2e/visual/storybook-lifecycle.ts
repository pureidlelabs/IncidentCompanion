/**
 * Loads one Storybook story into `iframe.html` and waits for what the probe
 * actually needs: not the first paint, but the story's own `play` function
 * (if it has one) having finished, and its `viewport` global applied to the
 * page that is about to be screenshotted.
 *
 * **Why the first paint is the wrong point.** `storybook.spec.ts` used to
 * capture as soon as `#storybook-root` had something in it, which is the
 * moment *before* `play` runs, not after. A story whose `play` clicks a
 * button or submits a dialog then hashed identical to its own default story
 * in `frame-oracle.ts`'s report -- not because the two render the same, but
 * because neither had run its `play` function yet.
 *
 * **`storyFinished`, not `storyRendered`.** Both are real events on
 * Storybook's channel; `storyRendered` fires when the initial render
 * completes and `play` is about to start, `storyFinished` fires once
 * rendering, `play` (thrown or not) and its `afterEach` hooks have all
 * settled --
 * `node_modules/storybook/dist/preview/runtime.js` emits `STORY_FINISHED`
 * from both the success path and the catch block around the whole render, so
 * a story with no `play` function fires it too. This is the same event
 * `@storybook/test-runner` waits on for the same reason.
 *
 * **The listener is armed before navigation, not after.** A fast story with
 * no `play` function can finish before a `page.evaluate` call reaches the
 * page, so attaching the listener from Node loses the race on exactly the
 * stories that need it least. `armStoryFinished` installs an init script that
 * runs before any of the page's own scripts and polls for Storybook's
 * channel to exist, so it is armed before `STORY_FINISHED` can fire.
 *
 * **The `viewport` global resizes the manager's `<iframe>`, and there is no
 * manager here.** `getEmbedResizeViewport` in the compiled preview only
 * computes the pixels for that resize; nothing inside `iframe.html` applies
 * them to its own document. `@storybook/addon-vitest` faces the same gap in
 * its own browser-mode component tests and resolves the global into pixels
 * itself, in its own Vitest plugin, before calling `page.viewport(...)`;
 * `applyStoryViewport` mirrors that resolution against `MINIMAL_VIEWPORTS`
 * and calls Playwright's `setViewportSize` instead.
 *
 * `window.__STORYBOOK_PREVIEW__` and `__STORYBOOK_ADDONS_CHANNEL__` are
 * undocumented internals, not a published API -- the same objects the
 * manager and `addon-vitest` themselves read the resolved globals from, and
 * the risk this module accepts to see what happened after `play` rather than
 * before it.
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
 *
 * Call once per `Page`, before the first `page.goto`. Playwright re-runs an
 * init script on every subsequent navigation, so one call covers every story
 * the page visits afterwards.
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

function parsePixels(dimension: string): number | null {
  const match = /^(\d+)px$/.exec(dimension)
  return match ? Number(match[1]) : null
}

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
 *
 * Answers `null` and leaves the page at its current size for the responsive
 * default, a viewport this tree does not set today (any `INITIAL_VIEWPORTS`
 * name, a percentage or `vw`/`vh`/`em` unit), or no Storybook preview to read
 * -- every `globals: { viewport: ... } }` in this tree names `mobile2`, and
 * widening support past `MINIMAL_VIEWPORTS`' four pixel-only entries has
 * nothing here to prove it against.
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

/** The opening words of `iframe.html`'s own handler, which is not the preview runtime's. */
const PREVIEW_SCRIPT_FAILED = "Failed to load the Storybook preview file 'vite-app.js'"

/**
 * What the preview script answers when asked again, from the page that failed to load it.
 *
 * **Storybook's error page carries no diagnosis**, so the reason is asked for
 * rather than read off it. -> the `visual-check` skill.
 *
 * A status is the answer when the server refused; a throw is the answer when
 * the connection did. An `ok` is an answer too: the fetch that failed was
 * served moments later, which is the shape a restarting dev server leaves.
 */
async function whyThePreviewScriptFailed(page: Page): Promise<string> {
  return page.evaluate(async () => {
    // The tag's `src` rather than the virtual path it is written with: Vite
    // rewrites it, and the rewritten URL is the one that was actually fetched.
    const tag = document.querySelector<HTMLScriptElement>('script[src*="vite-app"]')
    if (tag === null) return 'no preview script tag in the document to ask about'
    try {
      // **Bounded.** `page.evaluate` has no timeout of its own, so an
      // unbounded fetch is held only by the enclosing test's -- 45 minutes in
      // the sweep config, 120 in the affordance one. A server that accepts the
      // connection and never answers is exactly what a restarting Vite leaves,
      // which is the failure this whole check is written for: without the
      // signal the detector meant to replace a 30s timeout with a message can
      // produce a 45-minute one with no message at all.
      const answer = await fetch(tag.src, {
        cache: 'no-store',
        signal: AbortSignal.timeout(5_000),
      })
      // **`ok` does not mean the failure was transient**, and saying so sent
      // the next reader to retry a defect that will never pass. The `error`
      // event fires for a failure anywhere in the module graph, so a story
      // file, a decorator, `preview.tsx` or an addon that will not resolve or
      // transform leaves the entry script itself perfectly serveable.
      return answer.ok
        ? `the entry script re-fetched ${String(answer.status)}, so the failure is either ` +
          'in a module it imports or was transient -- read the preview console'
        : `re-fetched ${String(answer.status)} ${answer.statusText}`
    } catch (thrown) {
      return `re-fetch threw ${thrown instanceof Error ? thrown.message : String(thrown)}`
    }
  })
}

/**
 * What Storybook drew instead of the story, or `null` when it drew the story.
 *
 * **Storybook renders its own error page into the document rather than
 * throwing**, so a story that will not load looks like a story that drew
 * nothing -- and a spec waiting on one of its own elements reports a timeout on
 * that element instead. A preview that failed to fetch `vite-app.js` was read
 * as a layout defect for exactly that reason. -> #443
 *
 * **There are two such pages and they share no element**, so both are read: a
 * story that throws is drawn into `#error-message`, and a preview whose script
 * never loaded into `#storybook-root`, with `#error-message` left present and
 * empty. -> the `visual-check` skill.
 *
 * Call it after `#storybook-root` is attached: both pages are rendered into the
 * document, so there is nothing to read before then.
 */
export async function brokenPreview(page: Page): Promise<string | null> {
  const said = await page.locator('#error-message').textContent({ timeout: 1_000 })
  if (said !== null && said.trim() !== '') return said.trim().split('\n')[0] ?? ''
  const root = await page.locator('#storybook-root').textContent({ timeout: 1_000 })
  if (root === null || !root.includes(PREVIEW_SCRIPT_FAILED)) return null
  return `${PREVIEW_SCRIPT_FAILED}: ${await whyThePreviewScriptFailed(page)}`
}

export interface StoryLoad {
  /** The first line of Storybook's own error page, or `null` when it rendered. */
  broke: string | null
  /** What `play` threw, or `null` when it did not. Never read from the finish status. */
  playError: string | null
}

/**
 * Navigates to one story's standalone preview and waits until it has
 * genuinely finished -- `play` included -- applying its `viewport` global
 * along the way. Leaves probing and capturing to the caller.
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
  const broke = await brokenPreview(page)
  if (broke !== null) {
    return { broke, playError: null }
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
