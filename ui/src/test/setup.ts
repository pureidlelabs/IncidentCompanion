import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/dom'
import { afterEach } from 'vitest'

import { resetSessionForTest } from '@/api/session'

/**
 * **Testing Library waits one second by default, and this machine is slower
 * than that under load.** `findBy*` and `waitFor` both read
 * `asyncUtilTimeout`, which ships as 1000ms - not vitest's 5000ms test
 * timeout, which is the number people assume is in play.
 *
 * Measured: two files went red inside one `./verify.sh` run while the same
 * suite passed standing alone in the same run - `HeaderSearch` at 1187ms and
 * `ComplianceSection` at 2029ms, both against a one-second wait. A tier that
 * fails on how busy the machine is stops being read, which is the failure
 * this whole file is a list of.
 *
 * Raised here rather than at the call sites: seventeen of them restate the
 * default as `{ timeout: 1000 }`, which buys nothing and pins the fragility
 * in place.
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
 * `TimelineList` only to resolve one `data-slot`.
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
 * jsdom implements no Pointer Capture API, and Radix's `Select` calls
 * `hasPointerCapture` on its trigger while deciding whether a press became a
 * drag. Unstubbed it throws *outside* the test's own stack - reported as an
 * unhandled error and an absent listbox, which reads as "the select did not
 * open" rather than as a missing DOM method.
 *
 * Only `Select` needs it; `DropdownMenu` and `Popover` do not, which is why
 * the menus landed without this.
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
 * the command you type irrelevant.** It rode on the `test` script for three
 * days, on the belief that vitest 4 had nowhere in its config for it - the
 * string `execArgv` appears 43 times in its dist and is `InlineConfig.execArgv`,
 * flattened from the `poolOptions.<pool>.execArgv` that was looked for and not
 * found. Measured: with the config line and no `NODE_OPTIONS` anywhere, a bare
 * `npx vitest run` is green.
 *
 * **That belief cost two incidents and nearly a third mechanism.** Hours went
 * on 2026-08-09, ending in a Storage shim here that was reverted; the same
 * misreading happened again on 2026-08-15; and the fix attempted for *that* was
 * a guard in this file that threw when the flag was missing - which would have
 * made `verify.sh`, the repository's own one-command verifier, run zero
 * frontend tests instead of its previous 1578 passing. All three are the same
 * shape: carrying a flag by hand to every invocation site, then policing the
 * sites. One config line has no sites.
 */
