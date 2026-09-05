/**
 * **Every screen the rail offers, opened and looked at.**
 */
import { expect, test, type Page } from '@playwright/test'

import {
  ADMIN,
  ANALYST,
  asPersona,
  collectConsoleErrors,
  complaints,
  ensureAnalyst,
  ensureCase,
  openFirstCase,
  section,
  sections,
  settle,
} from './support/app.js'

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ browser, baseURL }) => {
  await ensureAnalyst(browser, baseURL ?? '')
  await ensureCase(browser, baseURL ?? '')
})

for (const who of [ADMIN, ANALYST]) {
  test.describe(`as ${who.role}`, () => {
    // Walking every section is one test on purpose - the list is the claim -
    // so it needs a budget shaped like the walk rather than like a click.
    test.setTimeout(180_000)

    test(`opens every section the rail offers`, async ({ browser }) => {
      const { context, page } = await asPersona(browser, who)
      const errors = collectConsoleErrors(page)
      try {
        await openFirstCase(page)
        const rail = await sections(page)

        /**
         * **A rail with one row is a rail that failed to render**, and every per-
         * section assertion below would pass over it in silence.
         */
        expect(rail.length, 'the case rail offered almost nothing').toBeGreaterThan(4)

        /**
         * **What was walked, in the report.**
         */
        test.info().annotations.push({
          type: 'sections',
          description: `${String(rail.length)}: ${rail.map((r) => r.slug).join(', ')}`,
        })

        const broken: string[] = []
        for (const { slug } of rail) {
          try {
            await section(page, slug)
            await expectRendered(page, slug)
          } catch (error) {
            broken.push(`${slug}: ${(error as Error).message.split('\n')[0]}`)
          }
        }
        expect(broken, `sections that did not open for ${who.role}`).toEqual([])
      } finally {
        await context.close()
      }
      /**
       * **Console errors are reported, not asserted to be zero.**
       */
      const fatal = errors.filter((line) => /uncaught:/.test(line))
      expect(fatal, `uncaught errors while walking the rail as ${who.role}`).toEqual([])
    })
  })
}

/**
 * A section counts as rendered when it drew *something* and is not complaining.
 */
async function expectRendered(page: Page, slug: string): Promise<void> {
  await settle(page, 8000)
  const main = page.locator('main').first()
  await expect(main, `${slug} rendered no main region`).toBeVisible()

  const text = (await main.innerText()).trim()
  expect(text.length, `${slug} rendered an empty pane`).toBeGreaterThan(0)

  const said = await complaints(page).allInnerTexts()
  expect(said.join(' | '), `${slug} opened with a complaint on it`).not.toMatch(
    /something went wrong|failed to load|unexpected error/i,
  )
}

/**
 * **Collapsing the rail is itself a control the sweeps press**, and it is
 * sticky - `RAIL_COLLAPSED_KEY` persists it.
 */
test('a collapsed rail is expanded again before a nested section is opened', async ({
  browser,
}) => {
  // **The tier's own case, through `openFirstCase`** - not `cases[0]` off
  // `GET /api/cases`. That endpoint orders by `updatedAt` descending, so
  // under `fullyParallel` it can name whichever worker last wrote, including
  // one `writing.spec.ts` is mid-deleting in its own `afterAll` - which fails
  // this test with the exact "no rail row for assets" message it exists to
  // rule out, for an unrelated reason.
  const { context, page } = await asPersona(browser, ADMIN)
  try {
    await openFirstCase(page)
    await section(page, 'entities')

    await page.locator('[data-testid="rail-trigger"]').click()
    await settle(page)
    await expect(
      page.locator('[data-testid="rail-trigger"]'),
      'the collapse trigger did not collapse the rail',
    ).toHaveAttribute('aria-expanded', 'false')
    // The mechanism, not only the symptom: collapsed, `assets` has no anchor
    // in the document at all (`CaseShell`'s fold branch gates
    // `SidebarMenuSub` on `!collapsed`). Without this the test cannot tell
    // "the rail was re-expanded" from "collapsing stopped hiding children".
    await expect(
      page.locator('[data-testid="case-rail"] nav a[href*="/assets"]'),
      'assets is reachable while the rail is collapsed - the fold gate this test relies on has changed',
    ).toHaveCount(0)

    await section(page, 'assets')
    expect(page.url().endsWith('/assets'), 'assets did not open after the rail was collapsed').toBe(
      true,
    )
  } finally {
    await context.close()
  }
})

test('the pane owns the scroll, not the document', async ({ browser, request }) => {
  // **A demo case, not the tier's own.** `ensureCase` builds an empty one, and
  // a pane with nothing in it does not overflow whatever the shell is doing -
  // the assertion would then pass against exactly the defect it names.
  const signedIn = await request.post('/api/auth/sign-in/email', {
    data: { email: ADMIN.email, password: ADMIN.password },
  })
  expect(signedIn.ok(), 'the browser tier could not sign in').toBe(true)
  const cases = (await (await request.get('/api/cases')).json()) as
    { id: string; isDemo?: boolean }[]
  const demo = cases.find((row) => row.isDemo)
  expect(demo, 'no demo case - nothing here has a pane long enough to scroll').toBeDefined()

  const { context, page } = await asPersona(browser, ADMIN)
  try {
    await page.setViewportSize({ width: 1000, height: 400 })
    await page.goto(`/cases/${demo?.id ?? ''}/timeline`, { waitUntil: 'domcontentloaded' })
    await settle(page)

    const shape = await page.evaluate(() => {
      const pane = document.querySelector('[data-slot="pane-scroll"]')
      const doc = document.scrollingElement
      if (!(pane instanceof HTMLElement) || !(doc instanceof HTMLElement)) return null
      return {
        paneOverflow: pane.scrollHeight - pane.clientHeight,
        docOverflow: doc.scrollHeight - doc.clientHeight,
        gutter: getComputedStyle(pane).scrollbarGutter,
      }
    })

    expect(shape, 'no pane on a case screen').not.toBeNull()
    expect(shape?.docOverflow, 'the document scrolls - the shell lost its height cap').toBe(0)
    expect(
      shape?.paneOverflow ?? 0,
      'the pane does not scroll at 400px tall, so nothing sticky in it can stick',
    ).toBeGreaterThan(0)
    expect(shape?.gutter, 'the pane lost its stable scrollbar gutter').toContain('stable')
  } finally {
    await context.close()
  }
})

test('the picker and the case wear the same header', async ({ browser, request }) => {
  const signedIn = await request.post('/api/auth/sign-in/email', {
    data: { email: ADMIN.email, password: ADMIN.password },
  })
  expect(signedIn.ok(), 'the browser tier could not sign in').toBe(true)
  const cases = (await (await request.get('/api/cases')).json()) as { id: string }[]
  const first = cases[0]
  expect(first, 'no case to open - nothing here has a case header').toBeDefined()

  const { context, page } = await asPersona(browser, ADMIN)
  try {
    const headerHeight = async () => {
      await settle(page)
      const box = await page.locator('header').first().boundingBox()
      expect(box, 'no header on this screen').not.toBeNull()
      return Math.round(box?.height ?? 0)
    }

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const picker = await headerHeight()

    await page.goto(`/cases/${first?.id ?? ''}`, { waitUntil: 'domcontentloaded' })
    const kase = await headerHeight()

    expect(picker, 'the picker header collapsed').toBeGreaterThan(0)
    expect(
      kase,
      `the two shells' headers have drifted apart again: picker ${String(picker)}px, case ${String(kase)}px`,
    ).toBe(picker)
  } finally {
    await context.close()
  }
})

/**
 * **The pane's top padding is keyed to a child, so a child has to be there.**
 */
test('the pane head is clear of the header', async ({ browser, request }) => {
  const signedIn = await request.post('/api/auth/sign-in/email', {
    data: { email: ADMIN.email, password: ADMIN.password },
  })
  expect(signedIn.ok(), 'the browser tier could not sign in').toBe(true)
  const cases = (await (await request.get('/api/cases')).json()) as
    { id: string; isDemo?: boolean }[]
  const demo = cases.find((row) => row.isDemo) ?? cases[0]
  expect(demo, 'no case to open').toBeDefined()

  const { context, page } = await asPersona(browser, ADMIN)
  try {
    await page.goto(`/cases/${demo?.id ?? ''}/timeline`, { waitUntil: 'domcontentloaded' })
    await settle(page)

    const gap = await page.evaluate(() => {
      const pane = document.querySelector('[data-slot="pane-scroll"]')
      const header = document.querySelector('header')
      if (!(pane instanceof HTMLElement) || !(header instanceof HTMLElement)) return null
      const first = pane.firstElementChild
      if (!(first instanceof HTMLElement)) return null
      return {
        firstIsDrawn: first.getBoundingClientRect().height > 0,
        // **The child's own padding, not its position.** `pt-6` sits inside
        // the first child, so its border box touches the pane's top edge
        // whether the rule applied or not - the first cut of this test
        // measured that gap, read 0, and would have read 0 against a correct
        // screen too.
        padTop: Math.round(Number.parseFloat(getComputedStyle(first).paddingTop)),
      }
    })

    expect(gap, 'no pane or no header on a case screen').not.toBeNull()
    expect(
      gap?.firstIsDrawn,
      "the pane's first child draws no box, so the padding rule keyed to it lands on nothing",
    ).toBe(true)
    expect(
      gap?.padTop ?? 0,
      'the pane head has no top padding - the rule keyed to the first child landed elsewhere',
    ).toBeGreaterThanOrEqual(16)
  } finally {
    await context.close()
  }
})
