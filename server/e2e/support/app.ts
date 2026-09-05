/**
 * Driving the app: personas, sign-in, navigation and the shared locators.
 *
 * **Every helper asserts its own postcondition rather than sleeping.** A run
 * that drives the wrong page and calls itself clean is worse than no run.
 *
 * **The selectors were derived once and are held here, not re-derived** -
 * rail rows read from `href` and not their text, a Base UI dialog announcing
 * itself with `data-open` and never `data-state="open"`, a select's listbox
 * portalled out of the dialog that owns it.
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
 *
 * **Checks both halves, because reachability alone is not enough.** No server
 * is a connection refused; a server with no built `ui/dist` answers
 * `/api/health` perfectly and gives every navigation a 404 body, which a
 * reachability-only check would drive and report as the app being broken.
 *
 * Call it from `beforeEach`, where `test.skip` may skip the test about to run.
 * `beforeAll` cannot skip.
 * -> `testing/a-stale-ui-dist-fails-the-browser-tier-as-though-the-app-were-broken`.
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
 *
 * Exported for teardown, which cannot call `test.skip` and must not fail the
 * run for being unable to reach a server that was never there.
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
     * **The shell, not a route the SPA owns.** Every unknown address is served
     * `index.html`, so a 200 on `/cases/anything` says nothing; `/` is the one
     * address whose 404 means the bundle itself is absent.
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
     *
     * **Which of the two is right depends on the question being asked**, and
     * until 2026-08-28 this refused the second outright. The incident behind
     * that refusal was a *stale* `dist` read as a fix that had not applied --
     * and Vite was serving the correct code throughout, so the guard was
     * pointed at the option that cannot go stale.
     *
     * `VISUAL_TARGET=vite` accepts the dev server, for the loop where a
     * rebuild between every capture is the cost. The default stays `dist`,
     * because that is what ships: the build extracts CSS that dev injects at
     * runtime, so a build-only style defect is invisible to a dev-server
     * capture. Iterate against Vite, land against `dist`.
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
 *
 * **This tier serves `ui/dist`, never `ui/src`.** `unservedReason` below
 * already refuses a Vite dev server outright - the shell has to carry a hashed
 * `/assets` script - so the browser sees whatever `npm run build` last wrote.
 * Nothing rebuilt it, and nothing said so: a capture of the previous build is
 * pixel-identical to a correct capture of code that has not changed, and a
 * spec asserting against it passes for the same reason.
 *
 * Measured 2026-08-21: a palette fix was made, captured twice, and read as not
 * having applied - the served class string was the one from before the edit,
 * while Vite on its own port served the new one. The `visual-check` skill said
 * in as many words that no staleness guard was needed because the sweep reads
 * the source on disk, which is the sentence that stopped anyone checking.
 *
 * The comparison is newest-mtime against newest-mtime, which is coarse on
 * purpose: it cannot say *which* file is stale, and it does not need to.
 * `node_modules` and dotfiles are skipped; a `.tsx` that only a test imports
 * still counts, since deciding otherwise means resolving the import graph.
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
 *
 * **The seeded account is the *admin*, and the name `analyst@example.test` is
 * misleading about that** - the first account signed up becomes the
 * administrator, and `dev-node.sh` signs that one up. A spec driving the
 * seeded login is testing the administrator's view. `ANALYST` below is a
 * second account, created on demand.
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
 *
 * **Not by signing up.** That door is open only while the install has no
 * accounts, so on any install this tier runs against it answers 403 -- and it
 * would be the one place the suite exercised a route no analyst can reach.
 *
 * **Idempotent by signing in first**, because the browser tier runs against a
 * database that persists between runs.
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
         * **Losing the race is not the same as being finished.** Four workers
         * call this at once; the one that creates the account then spends a
         * moment setting its password, and a loser that returned immediately
         * would hand its specs a persona that cannot sign in yet. So wait for
         * the winner rather than for a fixed time.
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
     * **An admin-created account arrives holding somebody else's password**, so
     * it reaches `/api/change-password` and nothing else until it sets its own.
     * Walking that here is what leaves every spec a persona that can work.
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
 *
 * **Not by planting a cookie.** `App` renders from the display identity in
 * `localStorage`, and only the sign-in form's success path writes it - so a
 * session cookie alone screenshots the login card in every combination.
 *
 * **The postcondition is the picker, not the form's absence.** A failed sign-in
 * also empties the form's busy state, and an unmounted router leaves a blank
 * page that satisfies "no form".
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
 *
 * **Two consecutive identical measurements, not one.** A fixed sleep measures
 * mid-transition, which is where a reproducible-looking "24px header overflow"
 * came from on a layout that had 20px of clearance.
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
 *
 * **Its own, rather than the demo case the picker ships with.** *Your cases*
 * excludes demos by design - the row carries `isDemo` and the pane filters on
 * it - so a fresh install's default pane is legitimately empty and a fixture
 * that clicks "the first row" there clicks nothing. Creating one also means a
 * sweep that presses Delete is destroying its own fixture rather than the
 * material every other spec reads.
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
 *
 * **A spec that only asserts the screen cannot tell a delete from a refetch
 * that dropped a row.** The row leaving the table is what the analyst sees;
 * the row leaving the collection is the claim. Both are asserted, and this is
 * how the second one is asked.
 *
 * The caller disposes it.
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
 *
 * Sharing one `Browser tier case` across every spec is what pins the config to
 * a single worker: `writing.spec` deletes it in teardown, the sweeps press
 * controls that change it, and `two-analysts` asserts that exactly two people
 * are in it. Racing those against each other asserts nothing.
 *
 * Keyed on `parallelIndex` rather than `workerIndex`: a worker that dies and is
 * replaced gets a fresh `workerIndex` and would strand its predecessor's case,
 * while `parallelIndex` is the slot and is reused.
 */
export function caseTitle(): string {
  return `Browser tier case ${String(test.info().parallelIndex)}`
}

/** The shared name, kept for the one caller that runs outside a test. */
export const CASE_TITLE = 'Browser tier case'

/**
 * Opens the tier's own case from the picker and proves the shell mounted.
 *
 * **The link in the title cell, not the row.** A `DataTable` row is not the
 * door - clicking one anywhere else selects or expands it - so a helper that
 * clicks the row waits twenty seconds for a shell that was never asked for and
 * reports the *case* as broken. The Python tier clicked the row because the
 * server-rendered picker made the whole row an anchor.
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
 *
 * **Discovered rather than listed**, because a literal list means a new screen
 * is covered by nothing while the sweep still reports a clean run. The slug
 * comes from the `href`'s *pathname* and never from the row's text: a row
 * carries an attention chip's count, two rows can share a title, and the
 * reports sub-rail links `report?report=<id>` - so splitting the raw attribute
 * yields a slug carrying a query string that no address can ever match.
 *
 * **Folds are opened first.** The six entity tables share one rail row, and a
 * closed fold renders none of its children - which reads exactly like a
 * section that does not exist.
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
 *
 * **Expands the rail itself first.** Collapsed, `CaseShell` draws no child
 * row at all - the fold branch gates `SidebarMenuSub` on `!collapsed` - so a
 * nested slug like `assets` has no `<a>` in the document until the rail is
 * open, whatever this function does to the folds inside it. The trigger lives
 * in the header rather than in `nav`, and it is `RAIL_COLLAPSED_KEY`-sticky:
 * `prodding.spec.ts` presses "Toggle Sidebar" while sweeping `entities`'s own
 * controls, which read afterwards as a rail row that had vanished.
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
 *
 * **Through the router, not `goto`.** A `goto` reloads the whole SPA, which
 * re-runs the sign-in check and refetches every query - so a sweep built on it
 * measures cold starts and never once exercises the client-side navigation the
 * analyst uses.
 *
 * **The postcondition is the URL *and* that the not-found state is absent**,
 * because `SectionOutlet` answers an unknown slug with an empty state that
 * renders perfectly: the address alone cannot tell "arrived" from "no such
 * section".
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
 *
 * **An error toast is raised with no timeout on purpose** - a refused write is
 * the one case where the screen shows the opposite of what happened - and it is
 * drawn bottom-right, which is where a dialog's Create button also lands. So a
 * refusal on one section sits on top of the primary action of every dialog
 * opened afterwards, until someone presses its X.
 *
 * Measured 2026-08-12: a refused network-indicator save blocked the submit of
 * the malware, cloud-apps and impact dialogs, and was still on screen 60s
 * later. That is a product decision to make, not the sweep's to work around -
 * so the sweep clears them and says so, rather than reporting three dialogs as
 * broken when what is broken is one toast.
 */
export async function dismissToasts(page: Page): Promise<number> {
  /**
   * **Anything inside a toast that dismisses it, by accessible name** rather
   * than by the markup of one toast shape.
   *
   * This selector has now broken twice, silently both times, and the shape of
   * the mistake was the same each time: it encoded what a toast happened to be
   * made of. It read `[data-type="error"][role="dialog"]` and matched nothing;
   * narrowed to the previous library's own close button, it then missed the
   * refusal card, which draws its own Dismiss and carried neither.
   *
   * A name is the durable half: `Dismiss` is what an analyst reads and a
   * screen reader announces on both shapes - the kit's close button carries it
   * as its `aria-label`, and `WriteFailure` writes it on a real button - so a
   * control that stops matching here is a control that stopped saying what it
   * does.
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
 *
 * **Both roles.** A destructive confirm is `role="alertdialog"` since
 * `ConfirmDeleteDialog` moved onto Base UI's `AlertDialog` - it announces
 * itself as requiring a response and focuses the safe choice. Matching only
 * `dialog` left `prodding.spec.ts` pressing Delete and finding no dialog to
 * close, which reads as a control that did nothing.
 */
export const DIALOG = '[role="dialog"][data-open], [role="alertdialog"][data-open]'

/**
 * Anything open that swallows a click meant for the page under it.
 *
 * **A menu is not a dialog and blocks exactly as well.** Measured 2026-08-19:
 * pressing a row's `...` opens `[role="menu"][data-open]`, which sits over the
 * rows beneath it -- so every later row action reported a five-second click
 * timeout on a control that was present, unclipped and enabled. Six of them,
 * across timeline and entities, reading as a product defect. The product was
 * right: Escape closes the menu, and nothing pressed Escape.
 */
export const OVERLAY = `${DIALOG}, [role="menu"][data-open]`

/**
 * Opens the current section's Add dialog, and answers whether it had one.
 *
 * **The postcondition is `[data-open]`, not the dialog's presence.** The
 * content mounts through a portal and is in the DOM for a frame before it is
 * open, so a check taken then sees an unpositioned box. `data-state="open"` is
 * Radix's spelling and matches nothing here - asserting it timed out for ten
 * seconds and reported "no dialog opened", which reads as a broken dialog.
 */
export async function openAddDialog(page: Page): Promise<boolean> {
  /**
   * **Scoped to `main`.** Unscoped, this finds the shell's own "New case" and
   * every section reports an Add dialog it does not have - including the
   * graphs and the report, which have none at all. A sweep that opens the
   * wrong door on twenty screens reports twenty covered screens.
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
 *
 * **Something left open is not a local failure.** It swallows every later
 * click, so the *next* navigation blocks - and with no action timeout that is a
 * hang rather than a failure, ten minutes from the control that caused it. So
 * this tries the key first, then the dialog's own close control, and reports
 * rather than throwing: the caller decides whether one that ignores Escape is
 * the defect it is looking for.
 *
 * **It watches `OVERLAY`, not `DIALOG`**, because a menu blocks the same way
 * and was doing so unseen. A caller that ignores the answer gets the same
 * silence back: `prodding` did, and attributed one open menu to six unrelated
 * controls.
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
 *
 * **Disabled controls are excluded and destructive ones are not pressed by
 * name.** A sweep that presses Delete walks a demo case into a state the next
 * spec inherits, and this tier shares one database across the file.
 */
export function pressableControls(page: Page): Locator {
  return page.locator(
    'main button:not([disabled]):not([aria-disabled="true"]), main [role="button"]:not([aria-disabled="true"])',
  )
}

/**
 * Anything the page is currently saying went wrong.
 *
 * **`role="alert"` and the error boundary's own copy**, because the two fail
 * differently: a refused write raises an alert on a screen that still works,
 * and a thrown render replaces the screen with a boundary that raises nothing.
 * A sweep watching only one of them reports the other as a clean pass.
 *
 * **A toast is judged by its tone, not by its role.** The kit's region is
 * React Aria's, so every toast carries `role="alert"` - a saved-successfully
 * toast included, and this sweep reads whatever it matches as a refusal. So a
 * toast is matched by its card and only where the card says `destructive` or
 * `warning`, and the toast's inner alerts are excluded to keep the card's own
 * text from being reported twice.
 */
export function complaints(page: Page): Locator {
  return page.locator(
    [
      '[role="alert"]:not([data-slot="toast"] [role="alert"])',
      '[data-slot="toast"][data-tone="destructive"]',
      '[data-slot="toast"][data-tone="warning"]',
      // The error screen renders `route-error`; nothing renders
      // `error-boundary`, so an arm for it would catch nothing. -> #270
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
 *
 * **Here rather than in `picker.spec.ts`, where it lived.** The visual sweep
 * walks the same panes, and the only findings the Python tier ever reported on
 * this app were on two of them - so a second copy would have been the second
 * thing to fix the day a `data-testid` moves.
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
 *
 * **It navigates back first, because the picker is a screen you can leave.**
 * `picker.spec.ts` presses every control each pane offers, and some of them are
 * links: the landing pane's "Continue where you left off" opens the case at the
 * section that analyst was last on. The sweep then pressed it, arrived in the
 * workspace, and the next call here failed with `no picker row for cases` - a
 * message that reads like a rail regression and is nothing of the kind.
 *
 * **It appears only once a visit has been recorded**, which is why this went
 * years without biting and then bit twice in one afternoon: anything that opens
 * a case as the tier's own persona - a measurement, a manual look - arms it for
 * the next run. A harness whose failure depends on what somebody did to the app
 * an hour ago is worse than a slow one.
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
