/**
 * The four things a visual sweep needs that the behaviour tier does not.
 *
 * **`support/app.ts` already owns navigation.** `settle`, `section`,
 * `sections`, `openEveryFold` and `dismissToasts` are its, and this file
 * imports them rather than carrying a second copy - two implementations of
 * "open a rail row" is precisely what the composite review gate exists to
 * catch, and the fold-behind-a-row rule is one nobody wants to learn twice.
 *
 * What is here is what only a *measuring* run needs: a quiescence that
 * **throws**, the three-pass probe, the capture, and the ground.
 */
import type { Page } from '@playwright/test'

import { settle } from '../support/app.js'

import { probe, type Finding } from './probe.js'
import { REACT_EXCLUDE } from './exclude.js'

const QUIESCE_TIMEOUT_MS = 20_000

export class VisualError extends Error {}

/**
 * Quiet, or an error - which is the difference from `support/app.ts::settle`.
 *
 * **That one returns after its timeout without saying so**, which is right for
 * a behaviour spec: the next assertion fails and names the real problem. It is
 * wrong for a sweep, where nothing asserts afterwards - the run captures a
 * screen still mid-transition and reports whatever that measured, which is the
 * exact mistake that produced a reproducible-looking "24px header overflow"
 * against 20px of real clearance.
 *
 * **Network idle first, because geometry stability is not enough.** A React
 * screen is stable *while it is still empty* - a skeleton holds still, so the
 * fingerprint alone certifies the loading state and finds nothing on it.
 * Reachable rather than a race: nothing polls (`refetchOnWindowFocus: false`,
 * no `refetchInterval`).
 */
export async function quiesce(page: Page, timeoutMs = QUIESCE_TIMEOUT_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs
  try {
    // **`networkidle` is deprecated and this tier still wants it.** Playwright
    // discourages it because a test should wait on the thing it is about; a
    // *visual* sweep is about the whole page having stopped, which is the one
    // case with no single thing to name. Replacing it needs a per-screen
    // readiness signal that does not exist yet.
    // eslint-disable-next-line playwright/no-networkidle
    await page.waitForLoadState('networkidle', { timeout: Math.max(1000, deadline - Date.now()) })
  } catch {
    throw new VisualError(`the page never went network-idle within ${String(timeoutMs)}ms`)
  }
  await settle(page, Math.max(1000, deadline - Date.now()))
  const busy = await page.locator('[aria-busy="true"]').count()
  if (busy > 0) {
    throw new VisualError(
      `${String(busy)} element(s) still aria-busy after ${String(timeoutMs)}ms - ` +
        'a capture now is of the skeleton, not the screen',
    )
  }
}

/**
 * The findings for the current screen, surviving three passes 400ms apart.
 *
 * **Two passes 250ms apart was not enough.** A phantom offscreen control on
 * Timeline survived both, in every engine and ground combination - which is
 * exactly the signature of a real cross-browser defect, and it was filed as
 * one.
 *
 * Toasts go first, for the reason `shoot` drops them: probing without doing so
 * reported a "Retry" button at 2.42:1 on two unrelated sections, which was a
 * notification that happened to be on screen.
 */
export async function findings(
  page: Page,
  root: string | null = null,
  passes = 3,
  gapMs = 400,
): Promise<Finding[]> {
  let agreed = new Map<string, Finding>()
  for (let index = 0; index < passes; index += 1) {
    // The gap between measurement passes, which is what makes two readings
    // independent -- the same poll interval as `settle`, not a sleep.
    // eslint-disable-next-line playwright/no-wait-for-timeout
    if (index) await page.waitForTimeout(gapMs)
    await stripToasts(page)
    await settle(page)
    const seen = new Map<string, Finding>()
    const args: [string | null, string] = [root, REACT_EXCLUDE]
    for (const one of await page.evaluate(probe, args)) seen.set(`${one.kind} ${one.what}`, one)
    agreed = index === 0 ? seen : new Map([...agreed].filter(([key]) => seen.has(key)))
    if (agreed.size === 0) break
  }
  return [...agreed.values()]
}

/**
 * One finding as a line.
 *
 * Same shape as `sweep.spec.ts`'s own line, so the two tiers read alike --
 * and interpolating the object instead prints `[object Object]`, which is a
 * failing sweep that says nothing about what failed.
 */
export function sayFinding(one: Finding): string {
  return `${one.kind}: ${one.detail}  [${one.what}]`
}

/**
 * Remove the toasts outright.
 *
 * **Not `support/app.ts::dismissToasts`**, which clicks each one's dismiss
 * control - that is the honest thing for a behaviour spec, since it proves the
 * control works, and it only reaches errors. A sweep wants them gone whatever
 * their kind: a notification across the bottom of a screenshot is
 * indistinguishable from a layout bug when the image is read later.
 */
async function stripToasts(page: Page): Promise<void> {
  await page.evaluate(() => {
    // Both spellings: the kit's region is what the app mounts, and the sonner
    // toaster is what a story may still draw. `exclude.ts` names
    // the region too, but that governs findings and this governs the image -
    // two mechanisms, and updating one leaves the capture with toasts in it.
    document.querySelectorAll('[data-slot="toast-region"], [data-sonner-toaster]').forEach((el) => {
      el.remove()
    })
  })
}

export async function shoot(page: Page, path: string): Promise<void> {
  await quiesce(page)
  await stripToasts(page)
  await page.screenshot({ path })
}

/**
 * Pick a ground and read it back.
 *
 * **The attribute is on `documentElement`**, written by `index.html`'s
 * pre-paint script and then by `GroundSwitcher`'s effect, never by the server.
 *
 * **`system` is a stored value with no document form.** Storage holds three
 * grounds and the document two: `system` resolves through `matchMedia`, so the
 * postcondition is the *resolved* ground agreeing with the browser's own
 * preference. Asserting `data-theme === "system"` fails against an entirely
 * correct app; asserting nothing passes a switcher that ignores the OS.
 *
 * Reading it back is not ceremony: an earlier ad-hoc sweep clicked what it
 * hoped was the switcher, slept, and produced twelve light screenshots
 * labelled dark.
 */
export type Ground = 'light' | 'dark' | 'system'

export async function setGround(page: Page, name: Ground): Promise<void> {
  const control = page.locator('select[aria-label="Theme"]')
  if (await control.count()) {
    await control.first().selectOption(name)
  } else {
    // `ic-theme` is `THEME_KEY`: `next-themes` persists it and `public/theme.js`
    // reads it before the bundle runs. Setting it here rather than pressing the
    // switcher is what keeps a ground reachable when the control moves -- a
    // sweep that could reach only the default reports a clean dark run having
    // never rendered one.
    await page.evaluate((value) => {
      window.localStorage.setItem('ic-theme', value)
    }, name)
    await page.reload()
  }
  await quiesce(page)

  const resolved = await page.evaluate(() => document.documentElement.dataset.theme ?? '')
  const wanted =
    name === 'system'
      ? await page.evaluate(() =>
          window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
        )
      : name
  if (resolved !== wanted) {
    throw new VisualError(
      `asked for the ${name} ground; the document says '${resolved || '<none>'}'`,
    )
  }
}

/**
 * Drive the Sentinel wizard to its review panel, or answer false.
 *
 * **A capture of a fresh page cannot see this screen, and it is the screen the
 * import feature is.** The wizard's first phase is a sign-in form; the panel an
 * analyst actually works in -- candidate rows, their identity verdicts, what
 * starts ticked -- exists four interactions later. A sweep that stops at the
 * connect phase reports the feature as covered while holding none of it.
 *
 * **`?importer=demo` is what makes it reachable at all.** The live source needs
 * an interactive Entra sign-in. -> `ui/src/api/sentinel/demoSource.ts`
 *
 * Answers `false` rather than throwing when the wizard is not on screen, so a
 * build without the importer sweeps the rest rather than failing the run.
 */
export async function driveImportReview(page: Page): Promise<boolean> {
  const url = new URL(page.url())
  url.searchParams.set('importer', 'demo')
  await page.goto(url.toString())
  await quiesce(page)

  const signIn = page.getByRole('button', { name: 'Sign in' })
  if ((await signIn.count()) === 0) return false
  await signIn.click()

  // **Every step answers false rather than throwing.** A timeout anywhere in
  // here fails the test, which ends the sweep - and this section sits in the
  // middle of the rail, so every section after it goes uncaptured. A sweep
  // that reports on two thirds of the views while looking complete is worse
  // than one that says it skipped a screen.
  try {
    const workspace = page.getByRole('button', { name: /aurora-soc/ }).first()
    await workspace.waitFor({ state: 'visible', timeout: 15_000 })
    await workspace.click()

    const incident = page.getByRole('checkbox', { name: /Import incident/ }).first()
    await incident.waitFor({ state: 'visible', timeout: 15_000 })
    await incident.click()
    await page.getByRole('button', { name: 'Continue' }).click()

    // The review panel is the server's answer, so waiting for it is also the
    // assertion that the preview round trip happened.
    //
    // **`/^Import\b/`, not the exact word.** The button reads
    // "Import 6 row(s)" - it counts what the preview came back with - so an
    // exact match waits out its timeout on a panel that is already on screen
    // and the sweep reports the importer as undrivable.
    await page
      .getByRole('button', { name: /^Import\b/ })
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 })
    await quiesce(page)
    return true
  } catch {
    // **Said out loud, never swallowed.** A silent `false` here reads exactly
    // like an install with no importer, which is the other thing this answers.
    console.log('  ! import review could not be driven - the rest of the sweep continues')
    return false
  }
}
