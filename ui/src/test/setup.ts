import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/dom'
import { notifyManager } from '@tanstack/react-query'
import type * as ReactDomClient from 'react-dom/client'
import { afterAll, afterEach, vi } from 'vitest'

import { resetSessionForTest } from '@/api/session'

/**
 * **Testing Library waits one second by default, and this machine is slower
 * than that under load.** `findBy*` and `waitFor` both read
 * `asyncUtilTimeout`, which ships as 1000ms - not vitest's 5000ms test
 * timeout, which is the number people assume is in play.
 *
 * Files go red inside a full `./verify.sh` run while the same suite passes
 * standing alone in it, on waits of one to two seconds. A tier that fails on
 * how busy the machine is stops being read, which is the failure this whole
 * file is a list of.
 *
 * Raised here rather than at the call sites, where restating the default as
 * `{ timeout: 1000 }` buys nothing and pins the fragility in place.
 */
configure({ asyncUtilTimeout: 5_000 })

/**
 * The signed-in identity is module state *and* is persisted, so it survives
 * between tests in one file and between files sharing a jsdom - a test that
 * signed in would otherwise leave the next one rendering as signed in, and the
 * signed-out case would pass for the wrong reason.
 */
afterEach(() => {
  resetSessionForTest()
})

/**
 * A test that leaves a React root mounted fails.
 *
 * Testing Library unmounts what it renders before this runs. A root made with
 * `createRoot` directly is the test's own to unmount, and one still mounted
 * goes on committing after the file's jsdom has gone, which fails whichever
 * file the worker is running then. -> #1316
 */
const mountedRoots = vi.hoisted(() => new Set<object>())
vi.mock('react-dom/client', async (importOriginal) => {
  const client = await importOriginal<typeof ReactDomClient>()
  return {
    ...client,
    createRoot: (...args: Parameters<typeof client.createRoot>) => {
      const root = client.createRoot(...args)
      const unmount = root.unmount.bind(root)
      root.unmount = () => {
        mountedRoots.delete(root)
        unmount()
      }
      mountedRoots.add(root)
      return root
    },
  }
})
afterEach(() => {
  const left = mountedRoots.size
  mountedRoots.clear()
  if (left > 0) {
    throw new Error(`the test left ${String(left)} React root(s) mounted; unmount what it mounts`)
  }
})

/**
 * A query notification still pending when its test ends is dropped.
 *
 * Every component has been unmounted by then, so it has no recipient. TanStack
 * delivers it on a `setTimeout(0)`, and one that fires after the file's jsdom
 * is torn down reads `window` inside React. -> #1316
 */
const pendingNotifications = new Set<ReturnType<typeof setTimeout>>()
notifyManager.setScheduler((notify) => {
  const timer = setTimeout(() => {
    pendingNotifications.delete(timer)
    notify()
  }, 0)
  pendingNotifications.add(timer)
})
function dropPendingNotifications() {
  for (const timer of pendingNotifications) clearTimeout(timer)
  pendingNotifications.clear()
}
afterEach(dropPendingNotifications)
afterAll(dropPendingNotifications)

/**
 * jsdom lays nothing out and defines no `scrollIntoView`, so any component
 * that scrolls a row into view throws here rather than in a browser.
 *
 * Stubbed globally rather than guarded at the call site: a `?.` on it is a
 * conditional TypeScript can prove is never taken, and writing one to satisfy
 * this tier would put a lie in the source. A test that wants to assert the
 * scroll spies on this.
 */
// Assigned unconditionally through a cast: TypeScript's DOM lib declares the
// method as always present, so `??=` is a conditional it can prove is never
// taken and the rule that catches dead conditions refuses it.
;(Element.prototype as { scrollIntoView: () => void }).scrollIntoView = () => {
  /* no layout to scroll */
}

/**
 * jsdom has no `ResizeObserver` and TanStack Virtual constructs one
 * unconditionally, so *mounting* a virtualised list throws - before any
 * assertion, and with a message about the observer rather than the list.
 *
 * Here rather than in each file, because the files that need it are not the
 * ones that look virtualised: the chord layer's selector contract mounts
 * `TimelineContainer` only to resolve one `data-part`.
 */
const scope = globalThis as { ResizeObserver?: unknown }
scope.ResizeObserver ??= class {
  observe() {
    /* jsdom lays nothing out, so there is nothing to report */
  }
  unobserve() {
    /* as above */
  }
  disconnect() {
    /* as above */
  }
}

/**
 * jsdom defines no `window.matchMedia`, and it is read by more than the tests
 * written for it: `next-themes` resolves `system` through it on every mount,
 * and `ambient-field.tsx` asks it for `prefers-reduced-motion`. A test that
 * cares about *which* value is reported installs its own `mockMatchMedia(...)`
 * (`test/matchMedia.ts`), which runs after this module and overwrites it;
 * `false` here is only enough to keep an unrelated test from throwing.
 *
 * Assigned unconditionally rather than `??=`: the DOM lib types `matchMedia`
 * as always present, so `??=` is a conditional the linter can prove is never
 * taken (the same reasoning `scrollIntoView` above is stubbed by).
 */
function stubMatchMedia(query: string) {
  return {
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    // The deprecated pair a real `MediaQueryList` still carries, because
    // `next-themes` calls it - see `test/matchMedia.ts` for why.
    addListener: () => undefined,
    removeListener: () => undefined,
  }
}
window.matchMedia = stubMatchMedia as unknown as typeof window.matchMedia

/**
 * jsdom has no `getClientRects` on a `Range` and no `elementFromPoint`, and
 * ProseMirror's view calls both while deciding where a selection is on screen.
 *
 * Unstubbed they throw from inside the library, *after* the test that caused
 * them has finished - so vitest reports an unhandled error attached to whatever
 * test ran next. Three appeared the moment a contenteditable reached the suite,
 * each naming an innocent test.
 *
 * Returning nothing is right rather than convenient: there is no layout here to
 * be at a point. What that costs is stated where it matters - the bubble menu
 * never renders in this tier, so its behaviour is asserted in `e2e/`.
 */
const range = Range.prototype as unknown as {
  getClientRects?: () => DOMRect[]
  getBoundingClientRect?: () => DOMRect
}
range.getClientRects ??= () => []
range.getBoundingClientRect ??= () => new DOMRect()
const doc = Document.prototype as unknown as { elementFromPoint?: () => null }
doc.elementFromPoint ??= () => null

/**
 * **Nothing stubs Web Storage here, and that is deliberate.** Node 25 enabled
 * `localStorage` as a global and 26 keeps it *defined but undefined* without
 * `--localstorage-file`, which shadows jsdom's own - vitest only populates
 * globals that are not already present, so the name being taken is enough for
 * every read to fall through to Node's getter.
 *
 * **The flag lives in `vite.config.ts` as `test.execArgv`, which is what makes
 * the command you type irrelevant.** It is `InlineConfig.execArgv`, not the
 * `poolOptions.<pool>.execArgv` the name suggests, so with the config line and
 * no `NODE_OPTIONS` anywhere a bare `npx vitest run` is green.
 *
 * **The alternatives are all the same shape**: carrying the flag by hand to
 * every invocation site, then policing the sites -- a shim here, or a guard
 * that throws when the flag is missing and makes `verify.sh` run zero frontend
 * tests rather than reporting why. One config line has no sites.
 */
