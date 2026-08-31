/**
 * The entity tables, on a case that has rows in them.
 *
 * **`sweep.spec.ts` has never captured a populated table, and nothing said
 * so.** It opens `Browser tier case <n>` - a case `ensureCase` creates empty
 * and no spec seeds - so every one of Assets, Accounts, Network, Malware,
 * Cloud Apps, Evidence, Impact and Indicators renders its empty state, in both
 * grounds, and the run reports "no findings" over eight screens that hold no
 * table. Found while swapping the table renderer for ReUI's data grid: a
 * change to every table in the app, and the sweep was clean before and after
 * because it was looking at eight empty-state illustrations.
 *
 * So this walks a **demo** case, which ships with rows. It is a capture rather
 * than an assertion, exactly like the sweep beside it - the probes run and
 * report, and the judgement is made by opening the images.
 *
 * Captures land in `.visual/tables`, gitignored with the rest.
 */
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import { ADMIN, asPersona, openEveryFold, section, settle } from '../support/app.js'

import { findings, quiesce, setGround, shoot } from './view.js'
import type { Ground } from './view.js'

const HERE = __dirname
const OUT = join(HERE, '../../.visual/tables')

const GROUNDS = (process.env.VISUAL_GROUNDS ?? 'light,dark').split(',').filter(Boolean) as Ground[]

/**
 * Every rail slug that draws a `DataTable`.
 *
 * **Listed, where the sweep discovers.** Discovery is right there and wrong
 * here: the point of this spec is the table, and a rail row that draws no
 * table would be captured as a clean pass that proves nothing - which is the
 * shape this spec exists because of. A slug the rail does not offer fails the
 * run.
 */
const TABLES = [
  'assets',
  'accounts',
  'network',
  'malware',
  'cloud-apps',
  'evidence',
  'impact',
  'indicators',
]

test('captures every entity table with rows in it', async ({ browser, request }) => {
  const signedIn = await request.post('/api/auth/sign-in/email', {
    data: { email: ADMIN.email, password: ADMIN.password },
  })
  expect(signedIn.ok(), 'the browser tier could not sign in').toBe(true)
  const cases = (await (await request.get('/api/cases')).json()) as
    { id: string; isDemo?: boolean }[]
  const demo = cases.find((row) => row.isDemo)
  expect(demo, 'no demo case - a table with no rows is what this spec exists to catch').toBeDefined()

  await rm(OUT, { recursive: true, force: true })
  await mkdir(OUT, { recursive: true })

  const { context, page } = await asPersona(browser, ADMIN)
  try {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/cases/${demo?.id ?? ''}`, { waitUntil: 'domcontentloaded' })
    await quiesce(page)
    await openEveryFold(page)

    for (const ground of GROUNDS) {
      await setGround(page, ground)
      for (const slug of TABLES) {
        await section(page, slug)
        await quiesce(page)
        // The claim this spec is here to make, stated rather than assumed: a
        // capture of an empty state under a table's name is the failure mode,
        // not a pass.
        const rows = await page.locator('tbody tr[data-row-id]').count()
        console.log(`${ground} ${slug}: ${String(rows)} rows`)
        await shoot(page, join(OUT, `${ground}-${slug}.png`))
        for (const finding of await findings(page)) {
          console.log(`  ${ground} - ${slug}: ${finding.kind}: ${finding.detail}  [${finding.what}]`)
        }
      }
    }
  } finally {
    await context.close()
  }
})

/**
 * The two filterable lists, which no tier captures.
 *
 * The skill names the command palette as not covered, and the header search
 * panel opens from typing so a fresh page never shows it either. Both are the
 * autocomplete primitive, and a swap of that component is invisible to every
 * suite in the tree: the unit tier has no layout and the sweep never opens
 * either surface.
 */
test('captures the command palette and the header search panel', async ({
  browser,
  request,
}) => {
  const signedIn = await request.post('/api/auth/sign-in/email', {
    data: { email: ADMIN.email, password: ADMIN.password },
  })
  expect(signedIn.ok(), 'the browser tier could not sign in').toBe(true)
  const cases = (await (await request.get('/api/cases')).json()) as
    { id: string; isDemo?: boolean }[]
  const demo = cases.find((row) => row.isDemo)
  expect(demo, 'no demo case').toBeDefined()

  await mkdir(OUT, { recursive: true })
  const { context, page } = await asPersona(browser, ADMIN)
  try {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/cases/${demo?.id ?? ''}`, { waitUntil: 'domcontentloaded' })
    await quiesce(page)

    for (const ground of GROUNDS) {
      await setGround(page, ground)

      // The header panel opens from typing, never from a trigger.
      await page.getByTestId('header-search').fill('a')
      await page.waitForSelector('[data-testid="header-search-row"]', { timeout: 10_000 })
      await settle(page)
      await shoot(page, join(OUT, `${ground}-header-search.png`))
      await page.keyboard.press('Escape')
      // **Focus has to leave the box before the chord will fire.**
      // `ChordLayer` ignores every shortcut while the target is a typing
      // target, which is what stops `k` opening the palette mid-word - so
      // Escape alone leaves the caret in the search field and Ctrl+K types a
      // character into it.
      await page.locator('[data-slot="pane-scroll"]').click({ position: { x: 5, y: 5 } })
      await settle(page)

      await page.keyboard.press('ControlOrMeta+k')
      await page.waitForSelector('[data-testid="command-palette"]', { timeout: 10_000 })
      await settle(page)
      await shoot(page, join(OUT, `${ground}-command-palette.png`))
      await page.keyboard.press('Escape')
      await settle(page)
    }
  } finally {
    await context.close()
  }
})

/**
 * The editor's keyboard sheet, which no tier draws.
 *
 * It opens on Cmd/Ctrl-slash from anywhere in a report and is in none of the
 * `DOORS` the dialog capture walks, so nothing has ever looked at it. What it
 * was hiding: `size="finder"` is a fixed height and the sheet's grid had no
 * scroll of its own, so the list ran past the card and painted over the page
 * behind it - and `DialogContent` did not clip, so nothing stopped it.
 */
test('captures the editor keyboard sheet', async ({ browser, request }) => {
  const signedIn = await request.post('/api/auth/sign-in/email', {
    data: { email: ADMIN.email, password: ADMIN.password },
  })
  expect(signedIn.ok(), 'the browser tier could not sign in').toBe(true)
  const cases = (await (await request.get('/api/cases')).json()) as
    { id: string; isDemo?: boolean }[]
  const demo = cases.find((row) => row.isDemo)
  expect(demo, 'no demo case - nothing here has a report to open').toBeDefined()

  await mkdir(OUT, { recursive: true })
  const { context, page } = await asPersona(browser, ADMIN)
  try {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/cases/${demo?.id ?? ''}/report`, { waitUntil: 'domcontentloaded' })
    await settle(page)
    await page.getByText(/Customer RCA/i).first().click()
    await settle(page)

    for (const ground of GROUNDS) {
      await setGround(page, ground)
      await page.keyboard.press('ControlOrMeta+/')
      const sheet = page.getByRole('dialog')
      await sheet.waitFor({ state: 'visible', timeout: 10_000 })
      await quiesce(page)
      // The whole viewport, not the dialog element: the defect this exists for
      // is content *outside* the card, which a locator screenshot crops away.
      await shoot(page, join(OUT, `${ground}-prose-keys.png`))
      await page.keyboard.press('Escape')
      await settle(page)
    }
  } finally {
    await context.close()
  }
})

/**
 * The report outline with its drag handles showing.
 *
 * The grip is `opacity-0` until the row is hovered, so a fresh capture draws
 * none - which is the state every other tier already covers. Hovering one row
 * is what shows the affordance an analyst actually meets.
 */
test('captures a report section with its drag handle', async ({ browser, request }) => {
  const signedIn = await request.post('/api/auth/sign-in/email', {
    data: { email: ADMIN.email, password: ADMIN.password },
  })
  expect(signedIn.ok(), 'the browser tier could not sign in').toBe(true)
  const cases = (await (await request.get('/api/cases')).json()) as
    { id: string; isDemo?: boolean }[]
  const demo = cases.find((row) => row.isDemo)
  expect(demo, 'no demo case').toBeDefined()

  await mkdir(OUT, { recursive: true })
  const { context, page } = await asPersona(browser, ADMIN)
  try {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/cases/${demo?.id ?? ''}/report`, { waitUntil: 'domcontentloaded' })
    await settle(page)
    await page.getByText(/Customer RCA/i).first().click()
    await settle(page)

    for (const ground of GROUNDS) {
      await setGround(page, ground)
      await page.locator('[role="listitem"]').nth(1).hover()
      await quiesce(page)
      await shoot(page, join(OUT, `${ground}-report-grip.png`))
    }
  } finally {
    await context.close()
  }
})
