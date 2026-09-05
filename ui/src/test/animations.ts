import { afterAll, beforeAll } from 'vitest'

/**
 * Give jsdom a `getAnimations()` for one test file.
 *
 * `ScrollArea` asks its viewport for `getAnimations()` on every scroll
 * measurement, and jsdom implements no Web Animations API - so a `ScrollArea`
 * inside an overlay throws from a listener rather than from a render. Vitest
 * reports that as an unhandled error beside a green summary line and exits 1
 * with no `FAIL` anywhere in the log.
 *
 * **Opt-in per file rather than in `setup.ts`, and that is a measurement
 * rather than caution.** Installed globally it went the other way and reddened
 * `HeaderSearch`: Base UI reads the same method to decide whether an exit
 * animation is still running, and an empty list makes an overlay unmount
 * synchronously - so the panel is gone before the click on one of its rows
 * lands, which is the failure `press.ts` and the `preventDefault` on each row
 * already exist to avoid. A stub that changes behaviour is not a stub, and
 * this one only does not change it in a file that never dismisses by clicking
 * through.
 *
 * Call at the top level of a test file that mounts a `ScrollArea` in a popover
 * or a dialog. Restores whatever was there.
 */
export function stubAnimations(): void {
  const target = Element.prototype as { getAnimations?: () => Animation[] }
  const had = Object.getOwnPropertyDescriptor(Element.prototype, 'getAnimations')

  beforeAll(() => {
    target.getAnimations = () => []
  })

  afterAll(() => {
    if (had) Object.defineProperty(Element.prototype, 'getAnimations', had)
    else delete target.getAnimations
  })
}
