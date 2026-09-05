/**
 * The four things a visual sweep needs that the behaviour tier does not.
 */
import type { Page } from '@playwright/test'

import { settle } from '../support/app.js'

import { probe, type Finding } from './probe.js'
import { REACT_EXCLUDE } from './exclude.js'

const QUIESCE_TIMEOUT_MS = 20_000

export class VisualError extends Error {}

/**
 * Quiet, or an error - which is the difference from `support/app.ts::settle`.
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
 */
export function sayFinding(one: Finding): string {
  return `${one.kind}: ${one.detail}  [${one.what}]`
}

/**
 * Remove the toasts outright.
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

/** Quiesce, drop the toasts, capture. */
export async function shoot(page: Page, path: string): Promise<void> {
  await quiesce(page)
  await stripToasts(page)
  await page.screenshot({ path })
}

/**
 * Pick a ground and read it back.
 */
export type Ground = 'light' | 'dark' | 'system'

export async function setGround(page: Page, name: Ground): Promise<void> {
  const control = page.locator('select[aria-label="Theme"]')
  if (await control.count()) {
    await control.first().selectOption(name)
  } else {
    // `ic-theme` in `localStorage` is what both the pre-paint script and the
    // module read. This path exists because where the preference lives is an
    // open question in `ground-switcher.tsx`; a sweep that could then reach
    // only the default would report a clean dark run having never rendered
    // one. Both paths are verified the same way, which is what makes it safe.
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
 */
export async function driveImportReview(page: Page): Promise<boolean> {
  const url = new URL(page.url())
  url.searchParams.set('importer', 'demo')
  await page.goto(url.toString())
  await quiesce(page)

  const signIn = page.getByRole('button', { name: 'Sign in' })
  if ((await signIn.count()) === 0) return false
  await signIn.click()

  // **Every step answers false rather than throwing, and that is the whole
  // point of this rewrite.** A timeout anywhere in here used to fail the test,
  // which ends the sweep - and this section is walked in the middle of the
  // rail, so eight sections after it were never captured at all: compliance,
  // report, archive, indicators, notes, actions, search and the two graphs.
  // A sweep that reports on 21 of 29 views while looking complete is worse
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
    // exact match waited twenty seconds on a panel that was already on
    // screen, and the sweep reported the importer as undrivable on every run
    // in both grounds. The review screen has never been captured.
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
