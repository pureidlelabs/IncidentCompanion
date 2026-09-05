import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/dom'
import { afterEach } from 'vitest'

import { resetSessionForTest } from '@/api/session'

/**
 * **Testing Library waits one second by default, and this machine is slower
 * than that under load.**
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
 * jsdom lays nothing out and defines no `scrollIntoView`, so any component
 * that scrolls a row into view throws here rather than in a browser.
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
 * jsdom defines no `window.matchMedia`, and both ground-switcher mounts
 * (`GroundSwitcher`, `RailGroundSwitcher`) call `prefersDark()` in an effect
 * on every mount, not only in tests written for the theme control - a shell
 * test rendering `CaseShell` or `PickerShell` now mounts one too.
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
 * jsdom implements no Pointer Capture API, and Radix's `Select` calls
 * `hasPointerCapture` on its trigger while deciding whether a press became a
 * drag.
 */
const el = Element.prototype as unknown as {
  hasPointerCapture?: () => boolean
  setPointerCapture?: () => void
  releasePointerCapture?: () => void
}
el.hasPointerCapture ??= () => false
el.setPointerCapture ??= () => undefined
el.releasePointerCapture ??= () => undefined

/**
 * jsdom has no `getClientRects` on a `Range` and no `elementFromPoint`, and
 * ProseMirror's view calls both while deciding where a selection is on screen.
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
 * **Nothing stubs Web Storage here, and that is deliberate.**
 */
