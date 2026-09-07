/**
 * **Every screen the rail offers, opened and looked at.**
 *
 * This is the tier that can see two halves which are each correct and
 * disagree: a client posting one body while its own route demands another
 * passes the server suite and the React suite and renders perfectly. Nothing
 * below the browser can observe it.
 *
 * **The sections are discovered, never listed.** A literal list means a screen
 * added tomorrow is covered by nothing while this file still reports a clean
 * run - and the rail is the same source the analyst navigates by.
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
         * **A rail with one row is a rail that failed to render**, and every
         * per-section assertion below would pass over it in silence. This is
         * the empty-set shape the harness rules warn about: a sweep of nothing
         * reports no findings.
         */
        expect(rail.length, 'the case rail offered almost nothing').toBeGreaterThan(4)

        /**
         * **What was walked, in the report.** A sweep over a discovered list
         * cannot say from its own green whether it covered twenty screens or
         * two, and "2 passed" reads identically either way - so the list is an
         * annotation rather than something a reader has to take on trust.
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
       * **Console errors are reported, not asserted to be zero.** A React
       * warning is not a defect and failing on one would make this file fail
       * for reasons nobody reads; a stack trace is, and it is the only place
       * this tier can see one.
       */
      const fatal = errors.filter((line) => /uncaught:/.test(line))
      expect(fatal, `uncaught errors while walking the rail as ${who.role}`).toEqual([])
    })
  })
}

/**
 * A section counts as rendered when it drew *something* and is not complaining.
 *
 * **Not "the heading is visible".** The screens do not share one heading
 * shape, and an assertion that names one is an assertion about four screens
 * that quietly passes over the rest.
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
 * sticky - `AppShell`'s `collapsedKey`, `case-rail` here, persists it. A
 * collapsed rail draws no child
 * row at all (`CaseFrame`'s fold branch gates `SidebarMenuSub` on
 * `!collapsed`), so a nested slug like `assets` genuinely has no `<a>` in the
 * document until the rail is expanded again - `openEveryFold` cannot help,
 * because the collapse trigger lives in the header, outside the `nav` it
 * scans, and carries no `aria-expanded="false"` inside that scope either way.
 *
 * `prodding.spec.ts` pressed "Toggle Sidebar" while sweeping `entities`'s own
 * controls, then failed every later child row with "no rail row for assets" -
 * reading as a missing reference, when the case was a collapsed rail the walk
 * never re-expanded.
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
    await section(page, 'assets')

    /**
     * **The rail is expanded again, which is the whole claim in the title.**
     *
     * **Asked of the trigger, because a folded rail still draws its rows.**
     * At 1440x900 folding takes the rail from 240px to 72px and leaves all 22
     * anchors in the document and visible, the five nested ones included, with
     * every icon on the rail's centre - `CaseFrame` gates a child row on the
     * *fold* of its parent group, never on the rail being collapsed. So the
     * absence of a nested anchor cannot tell *re-expanded* from *folded*,
     * and `aria-expanded` can: it read `false` above, and anything that opened
     * the section without re-expanding would leave it there.
     */
    await expect(
      page.locator('[data-testid="rail-trigger"]'),
      'the nested section opened without the rail being expanded again',
    ).toHaveAttribute('aria-expanded', 'true')

    // **A fragment, not a path segment.** A nested section is addressed as
    // `entities#assets`, so the pathname ends in the parent.
    expect(page.url().endsWith('#assets'), 'assets did not open after the rail was collapsed').toBe(
      true,
    )
  } finally {
    await context.close()
  }
})

/**
 * **The pane scrolls, and the document does not.**
 *
 * This is a shell property, not a section's, and it fails silently: the pane
 * is `flex-1 min-h-0 overflow-y-auto`, which only engages inside an ancestor
 * with a definite height. Give the shell a minimum height instead of a cap and
 * it grows with its content, the *document* becomes the scroller, and the pane
 * never scrolls at all.
 *
 * **Three things break together and none of them is red anywhere.** Every
 * `position: sticky` in a pane resolves against its nearest scrolling
 * ancestor, so a section's filter bar and a table's sticky header both stop
 * freezing; and the pane's `scrollbar-gutter: stable` reserves nothing,
 * because the pane is not the scroller. jsdom lays out none of it, and the
 * sweep captures a fresh 1440x900 page where the content fits.
 *
 * The viewport is deliberately short: at 900px tall the demo case's sections
 * fit and the assertion would pass against a broken shell.
 */
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

/**
 * **Both signed-in screens wear the same header, measured.**
 *
 * A header sized from its tallest control and one fixed to a height land a few
 * pixels apart, and nothing goes red: each screen is correct alone, and the
 * difference is only visible to somebody moving between them, which is what an
 * analyst does all day.
 *
 * **This is the property `AppShell` exists for**, and the only tier that can
 * hold it: jsdom gives every element a zero box, so the unit suite reads 0
 * against 0 and agrees.
 *
 * It asserts they are *equal* rather than that either is 56, because the number
 * is the layout's to choose and the sameness is the rule.
 */
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
 *
 * The case pane puts it on `[&>*:first-child]:pt-6` rather than on the
 * scroller - a `sticky top-0` child sticks to the scrollport's padding edge,
 * so padding there is a strip every sticky band peeks out of. The cost is that
 * the rule now depends on which element happens to come first.
 *
 * **What this holds is narrower than it looks, and the break-verify is what
 * says so.** Planting a zero-box element at the top of the pane leaves this
 * green: the CSS applies to whatever is first, and an empty element with the
 * padding on it measures the padding.
 *
 * So it asserts the padding resolves to a drawn element, and it would catch the
 * rule being deleted or the class being renamed. It would not catch a first
 * child that is present, padded and useless. Recorded rather than dressed up,
 * because a test whose name promises more than it holds is worse than none.
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
        // whether the rule applied or not, so measuring that gap reads 0
        // against a correct screen as readily as against a broken one.
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
