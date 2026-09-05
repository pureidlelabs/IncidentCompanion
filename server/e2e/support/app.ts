/**
 * Driving the app: personas, sign-in, navigation and the shared locators.
 */
import { readdirSync, statSync, type Dirent } from 'node:fs'
import { join } from 'node:path'

import {
  expect,
  request as apiRequest,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test'

/**
 * Refuses to run against half an install, and says which half is missing.
 */
export async function requireServedApp(baseURL: string): Promise<void> {
  const stale = staleBundleReason()
  // **A throw, not a skip.** A stale bundle is not "no server to talk to" - it
  // is a server answering with the wrong code, and every assertion and every
  // capture that follows is about a build nobody asked for.
  if (stale !== null) throw new Error(stale)
  const why = await unservedReason(baseURL)
  if (why === null) return
  // The reason on stdout, because the list reporter prints a skip as one dash
  // and the annotation is only read by whoever opens the HTML report.
  console.warn(`SKIPPED ${test.info().titlePath.join(' > ')}: ${why}`)
  test.info().annotations.push({ type: 'skipped', description: why })
  test.skip(true, why)
}

/**
 * Why this tier cannot run, or `null` when it can.
 */
export async function unservedReason(baseURL: string): Promise<string | null> {
  if (!baseURL) return 'no baseURL - run with `-c e2e/playwright.config.ts`, which declares it'

  const api = await apiRequest.newContext({ baseURL, ignoreHTTPSErrors: true })
  try {
    const health = await api
      .get('/api/health', { failOnStatusCode: false, timeout: 10_000 })
      .catch(() => null)
    if (health === null || !health.ok()) {
      return `no app answering at ${baseURL} - start one with ./dev-node.sh`
    }

    /**
     * **The shell, not a route the SPA owns.**
     */
    const shell = await api.get('/', { failOnStatusCode: false }).catch(() => null)
    if (shell === null || !shell.ok()) {
      return `${baseURL} serves the API but no front end (GET / answered ${String(
        shell?.status() ?? 'nothing',
      )}) - run \`npm run build\` in \`ui\``
    }
    /**
     * A built bundle is a hashed script under `/assets`; a Vite dev server
     * serves `/src/main.tsx` there instead.
     */
    if (
      process.env.VISUAL_TARGET === 'dist' &&
      !/<script[^>]+src="\/assets\/[^"]+\.js"/.test(await shell.text())
    ) {
      return (
        `VISUAL_TARGET=dist was asked for and ${baseURL} served no built bundle - ` +
        `run \`npm run build\` in \`ui\`, or drop the variable to sweep the dev server`
      )
    }
  } finally {
    await api.dispose()
  }
  return null
}

/**
 * Why the served bundle is older than the source, or `null` when it is not.
 */
let staleAnswer: string | null | undefined

export function staleBundleReason(): string | null {
  // **Nothing to be stale against**, unless `dist` is what was asked for. The
  // dev server is served from source, so `ui/dist` is whatever it was and says
  // nothing about what was captured -- reporting it would be a refusal about a
  // directory the run never read.
  if (process.env.VISUAL_TARGET !== 'dist') return null
  // Memoised per process: the walk is over the whole of `ui/src` and `ui/dist`
  // and the answer cannot change mid-run - nothing rebuilds while Playwright
  // is driving.
  if (staleAnswer !== undefined) return staleAnswer
  staleAnswer = measureStaleBundle()
  return staleAnswer
}

function measureStaleBundle(): string | null {
  // **`__dirname`, not `import.meta`.** Playwright loads a spec and everything
  // it imports through a CommonJS wrapper whatever the extension says, so
  // `import.meta.url` throws before a single test is collected - and the run
  // then reports "No tests found", which reads as a bad `testMatch`.
  // `playwright.visual.config.ts` and `sweep.spec.ts` had both already paid
  // for this one.
  const ui = join(__dirname, '../../../ui')
  const newest = (root: string): number => {
    let latest = 0
    const walk = (at: string): void => {
      let entries: Dirent[]
      try {
        entries = readdirSync(at, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
        const path = join(at, entry.name)
        if (entry.isDirectory()) walk(path)
        else latest = Math.max(latest, statSync(path).mtimeMs)
      }
    }
    walk(root)
    return latest
  }
  const built = newest(join(ui, 'dist'))
  if (built === 0) return 'ui/dist is empty - run `npm run build` in `ui`'
  const source = newest(join(ui, 'src'))
  if (source <= built) return null
  return (
    'ui/dist is older than ui/src, so this tier would drive the previous build - ' +
    'run `npm run build` in `ui`'
  )
}

/**
 * The two people the app has.
 */
export const ADMIN = {
  email: process.env.INCIDENTCOMPANION_E2E_USER ?? 'analyst@example.test',
  password: process.env.INCIDENTCOMPANION_E2E_PASSWORD ?? 'incidentcompanion-dev',
  role: 'admin' as const,
}

export const ANALYST = {
  email: 'browser-tier-analyst@example.test',
  password: 'incidentcompanion-dev',
  role: 'analyst' as const,
}

export type Persona = typeof ADMIN | typeof ANALYST

/** What the admin issues the analyst, before the analyst replaces it. */
const ISSUED = 'browser-tier-issued-1234'

/** Signs in through the API and answers whether the credentials were taken. */
async function apiSignIn(
  context: BrowserContext,
  baseURL: string,
  email: string,
  password: string,
): Promise<boolean> {
  const answer = await context.request.post(`${baseURL}/api/auth/sign-in/email`, {
    data: { email, password },
    failOnStatusCode: false,
  })
  return answer.ok()
}

/**
 * Makes sure the analyst persona exists, **the way an install really makes
 * one** - an administrator creates it and the account then sets its own
 * password.
 */
export async function ensureAnalyst(browser: Browser, baseURL: string): Promise<void> {
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  try {
    if (await apiSignIn(context, baseURL, ANALYST.email, ANALYST.password)) return

    const asAdmin = await browser.newContext({ ignoreHTTPSErrors: true })
    try {
      expect(
        await apiSignIn(asAdmin, baseURL, ADMIN.email, ADMIN.password),
        'the browser tier needs its admin before it can create anybody',
      ).toBe(true)

      const made = await asAdmin.request.post(`${baseURL}/api/accounts`, {
        data: {
          username: ANALYST.email,
          displayName: 'Browser Tier Analyst',
          password: ISSUED,
          role: ANALYST.role,
        },
        failOnStatusCode: false,
      })
      if (!made.ok()) {
        const said = await made.text()
        // An account that exists but would not take the password above is the
        // one case worth naming: it is left over from a run that changed it.
        expect(said, `creating the analyst answered ${String(made.status())}: ${said}`).toMatch(
          /already/i,
        )
        /**
         * **Losing the race is not the same as being finished.**
         */
        for (let attempt = 0; attempt < 20; attempt += 1) {
          if (await apiSignIn(context, baseURL, ANALYST.email, ANALYST.password)) return
          await new Promise((wake) => setTimeout(wake, 500))
        }
        throw new Error('another worker created the analyst but never set its password')
      }
    } finally {
      await asAdmin.close()
    }

    /**
     * **An admin-created account arrives holding somebody else's password**, so it
     * reaches `/api/change-password` and nothing else until it sets its own.
     */
    const held = await browser.newContext({ ignoreHTTPSErrors: true })
    try {
      expect(await apiSignIn(held, baseURL, ANALYST.email, ISSUED)).toBe(true)
      const changed = await held.request.post(`${baseURL}/api/change-password`, {
        data: { current: ISSUED, password: ANALYST.password, repeat: ANALYST.password },
        failOnStatusCode: false,
      })
      expect(
        changed.ok(),
        `the analyst could not set its own password: ${String(changed.status())} ${await changed.text()}`,
      ).toBe(true)
    } finally {
      await held.close()
    }
  } finally {
    await context.close()
  }
}

/**
 * Sign in through the SPA's own form.
 */
export async function signIn(page: Page, who: Persona = ADMIN): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  const email = page.getByLabel(/e-?mail|username/i).first()
  await email.waitFor({ state: 'visible' })
  await email.fill(who.email)
  await page.getByLabel(/password/i).first().fill(who.password)
  await page.getByRole('button', { name: /sign in/i }).click()

  await expect(
    page.getByRole('heading', { name: /cases/i }).first(),
    `signed in as ${who.email} but the picker never appeared`,
  ).toBeVisible()
}

/** A signed-in page for one persona, in its own storage. */
export async function asPersona(browser: Browser, who: Persona): Promise<{
  context: BrowserContext
  page: Page
}> {
  // **Here rather than only in `requireServedApp`.** Every browser spec signs
  // somebody in and only the sweep calls `requireServedApp`, so a guard living
  // there alone is one a new spec silently opts out of - which is exactly what
  // `tables.spec.ts` did on the day this was written.
  const stale = staleBundleReason()
  if (stale !== null) throw new Error(stale)
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await context.newPage()
  await signIn(page, who)
  return { context, page }
}

/**
 * Waits until the page stops moving, rather than for a fixed time.
 */
export async function settle(page: Page, timeout = 10_000): Promise<void> {
  const fingerprint = async (): Promise<string> =>
    page.evaluate(() => {
      const boxes = [...document.querySelectorAll('main *')].slice(0, 200).map((node) => {
        const box = node.getBoundingClientRect()
        return `${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.width)}`
      })
      return `${String(document.querySelectorAll('[aria-busy="true"]').length)}|${boxes.join(';')}`
    })

  const until = Date.now() + timeout
  let previous = await fingerprint()
  while (Date.now() < until) {
    // **A poll interval, not a sleep-and-hope.** The loop fingerprints the
    // geometry and exits when two readings agree; this is the gap between
    // readings, which is the thing the rule is right to ban everywhere else.
    // eslint-disable-next-line playwright/no-wait-for-timeout
    await page.waitForTimeout(120)
    const now = await fingerprint()
    // Quiet means both: the geometry stopped moving *and* nothing is still
    // loading. A page can be perfectly still while a request is in flight.
    const quiet = now === previous && now.startsWith('0|')
    if (quiet) return
    previous = now
  }
}

/**
 * Makes sure this tier has a case of its own, and returns its title.
 */
export async function ensureCase(browser: Browser, baseURL: string): Promise<string> {
  const title = caseTitle()
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  try {
    const signedIn = await context.request.post(`${baseURL}/api/auth/sign-in/email`, {
      data: { email: ADMIN.email, password: ADMIN.password },
    })
    expect(signedIn.ok(), 'the fixture could not sign in to create its case').toBeTruthy()

    const existing = await (await context.request.get(`${baseURL}/api/cases`)).json()
    const mine = (existing as { title: string; isDemo?: boolean }[]).find(
      (row) => !row.isDemo && row.title === title,
    )
    if (mine) return title

    const made = await context.request.post(`${baseURL}/api/cases`, {
      data: { title, reference: 'E2E-0001', customer: 'Browser Tier' },
    })
    expect(made.ok(), `creating the fixture case answered ${String(made.status())}`).toBeTruthy()
    return title
  } finally {
    await context.close()
  }
}

/**
 * A signed-in API context for the admin, for seeding and for reading back.
 */
export async function asAdminApi(baseURL: string): Promise<APIRequestContext> {
  const api = await apiRequest.newContext({ baseURL, ignoreHTTPSErrors: true })
  const signedIn = await api.post('/api/auth/sign-in/email', {
    data: { email: ADMIN.email, password: ADMIN.password },
    failOnStatusCode: false,
  })
  expect(signedIn.ok(), 'the fixture could not sign in to reach the API').toBeTruthy()
  return api
}

/** The id of this worker's own case. `ensureCase` must have run. */
export async function fixtureCaseId(api: APIRequestContext): Promise<string> {
  const title = caseTitle()
  const rows = (await (await api.get('/api/cases')).json()) as {
    id: string
    title: string
    isDemo?: boolean
  }[]
  const mine = rows.find((row) => !row.isDemo && row.title === title)
  expect(mine, `no case called ${title} - ensureCase did not run`).toBeTruthy()
  return mine?.id ?? ''
}

/**
 * **One case per worker, which is what makes the tier parallelisable.**
 */
export function caseTitle(): string {
  return `Browser tier case ${String(test.info().parallelIndex)}`
}

/** The shared name, kept for the one caller that runs outside a test. */
export const CASE_TITLE = 'Browser tier case'

/**
 * Opens the tier's own case from the picker and proves the shell mounted.
 */
export async function openFirstCase(page: Page): Promise<void> {
  const title = caseTitle()
  const row = page.getByRole('row').filter({ hasText: title }).first()
  await expect(row, `the picker never listed ${title}`).toBeVisible({ timeout: 20_000 })
  await row.getByRole('link').first().click()
  await expect(
    page.locator('[data-testid="rail"]'),
    'the case shell never mounted',
  ).toBeVisible({ timeout: 20_000 })
  await settle(page)
}

/**
 * Every rail row, as `{ slug, label }`, read from the rail itself.
 */
export async function sections(page: Page): Promise<{ slug: string; label: string }[]> {
  await openEveryFold(page)
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="rail"] nav a[href*="/cases/"]')].map(
      (a) =>
        [
          new URL((a as HTMLAnchorElement).href).pathname.split('/').pop() ?? '',
          (a.textContent ?? '').trim(),
        ] as const,
    ),
  )
  const seen = new Map<string, string>()
  for (const [slug, label] of rows) if (slug && !seen.has(slug)) seen.set(slug, label || slug)
  return [...seen].map(([slug, label]) => ({ slug, label }))
}

/**
 * Opens every collapsed fold in the rail, so its rows are reachable.
 */
export async function openEveryFold(page: Page): Promise<void> {
  const collapseTrigger = page.locator('[data-testid="rail-trigger"]')
  if ((await collapseTrigger.count()) > 0) {
    const expanded = await collapseTrigger.getAttribute('aria-expanded')
    if (expanded === 'false') {
      await collapseTrigger.click()
      await settle(page, 3000)
    }
  }

  const shut = page.locator('[data-testid="rail"] nav button[aria-expanded="false"]')
  for (let i = await shut.count(); i > 0; i = await shut.count()) {
    await shut.first().click()
    await settle(page, 3000)
    if ((await shut.count()) >= i) break
  }
}

/**
 * Navigates to a section by clicking its rail row, then reads the address back.
 */
export async function section(page: Page, slug: string): Promise<void> {
  await openEveryFold(page)
  const row = page.locator(`[data-testid="rail"] nav a[href*="/${slug}"]`).first()
  await expect(row, `no rail row for ${slug}`).toHaveCount(1)
  await row.click()
  await page.waitForFunction(
    (want) => location.pathname.split('/').pop() === want,
    slug,
    { timeout: 15_000 },
  )
  await expect(
    page.getByText('No such section'),
    `${slug} rendered the not-found empty state \u2014 the rail links to a section the router cannot resolve`,
  ).toHaveCount(0)
  await settle(page)
}

/**
 * Dismisses any toast still on screen.
 */
export async function dismissToasts(page: Page): Promise<number> {
  /**
   * **Anything inside a toast that dismisses it, by accessible name** rather
   * than by the markup of one toast shape.
   */
  const close = page
    .locator('[data-slot="toast"]')
    .getByRole('button', { name: 'Dismiss' })
  let cleared = 0
  for (let n = await close.count(); n > 0; n = await close.count()) {
    await close.first().click().catch(() => undefined)
    cleared += 1
    await settle(page, 1500)
    if ((await close.count()) >= n) break
  }
  return cleared
}

/**
 * This tier's open dialog card. Base UI writes `data-open`, never `data-state`.
 */
export const DIALOG = '[role="dialog"][data-open], [role="alertdialog"][data-open]'

/**
 * Anything open that swallows a click meant for the page under it.
 */
export const OVERLAY = `${DIALOG}, [role="menu"][data-open]`

/**
 * Opens the current section's Add dialog, and answers whether it had one.
 */
export async function openAddDialog(page: Page): Promise<boolean> {
  /**
   * **Scoped to `main`.**
   */
  const trigger = page.locator('main').getByRole('button', { name: /^(Add|New) / }).first()
  if ((await trigger.count()) === 0) return false
  await trigger.click()
  await expect(page.locator(DIALOG), 'pressed Add and no dialog opened').toBeVisible({
    timeout: 10_000,
  })
  await settle(page)
  return true
}

/**
 * Closes whatever is open over the page, and answers whether Escape sufficed.
 */
export async function closeDialog(page: Page): Promise<'closed' | 'needed-button' | 'stuck'> {
  if ((await page.locator(OVERLAY).count()) === 0) return 'closed'

  await page.keyboard.press('Escape')
  await settle(page, 2000)
  if ((await page.locator(OVERLAY).count()) === 0) return 'closed'

  const close = page
    .locator(DIALOG)
    .getByRole('button', { name: /close|cancel|dismiss/i })
    .first()
  if ((await close.count()) > 0) {
    await close.click().catch(() => undefined)
    await settle(page, 2000)
    if ((await page.locator(OVERLAY).count()) === 0) return 'needed-button'
  }
  return 'stuck'
}

/**
 * Every control on the screen a sweep may press.
 */
export function pressableControls(page: Page): Locator {
  return page.locator(
    'main button:not([disabled]):not([aria-disabled="true"]), main [role="button"]:not([aria-disabled="true"])',
  )
}

/**
 * Anything the page is currently saying went wrong.
 */
export function complaints(page: Page): Locator {
  return page.locator(
    [
      '[role="alert"]:not([data-slot="toast"] [role="alert"])',
      '[data-slot="toast"][data-tone="destructive"]',
      '[data-slot="toast"][data-tone="warning"]',
      // The error screen renders `route-error`; `error-boundary` was never rendered
      // by anything, so this arm caught nothing. -> #270
      '[data-testid="route-error"]',
    ].join(', '),
  )
}

/** The browser's own console errors, collected from the moment it is called. */
export function collectConsoleErrors(page: Page): string[] {
  const found: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') found.push(message.text())
  })
  page.on('pageerror', (error) => found.push(`uncaught: ${error.message}`))
  return found
}

/**
 * Every pane the picker rail offers, discovered rather than listed.
 */
export async function panes(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="picker-row-"]')]
      .map((node) => node.getAttribute('data-testid')?.replace('picker-row-', '') ?? '')
      .filter((slug) => slug !== ''),
  )
}

/**
 * Open one, and wait for it rather than assuming the click landed.
 */
export async function openPane(page: Page, slug: string): Promise<void> {
  const railed = await page.locator('[data-testid="picker-rail"]').count()
  if (railed === 0) {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await settle(page, 6000)
  }

  const row = page.locator(`[data-testid="picker-row-${slug}"]`).first()
  if ((await row.count()) !== 1) {
    throw new Error(`no picker row for ${slug} - and the picker rail is on screen`)
  }
  await row.click()
  await settle(page, 6000)
}
