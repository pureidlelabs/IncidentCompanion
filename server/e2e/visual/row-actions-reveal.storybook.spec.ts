/**
 * The row-actions cluster is reachable: it appears under a real pointer and
 * under a real keyboard, and goes away again.
 *
 * **This is the only tier that can see it.** jsdom has no CSS at all, so
 * `getByRole('button', { name: /Edit/ })` finds these buttons whatever their
 * opacity, and every unit test that ever asked whether a row offers Edit
 * passed while nothing was reachable. The Storybook play tier cannot see it
 * either: `userEvent.hover` dispatches pointer events without moving a
 * pointer, so no element ever matches CSS `:hover` and nothing sets React
 * Aria's `data-hovered`.
 *
 * The reveal has two independent routes and both are asserted, because each
 * has failed on its own:
 *
 * - **Pointer.** `group-hover/row:opacity-100` compiles to a selector that
 *   matches `[data-rac][data-hovered]` for a React Aria element and plain
 *   `:hover` only for one without `data-rac`. A row that React Aria does not
 *   consider interactive is never given `data-hovered`, so the variant is
 *   correct, compiled, and unable to fire. What makes the row interactive is
 *   its `onAction`.
 * - **Keyboard.** `has-[:focus-visible]:opacity-100`, which had never been
 *   confirmed against a browser.
 *
 * It needs a Storybook and skips with a reason when there is none, exactly as
 * `storybook.spec.ts` next to it does.
 *
 * ```bash
 * cd ui && npm run storybook          # in another shell, first
 * cd server && npx playwright test --config=e2e/visual/playwright.storybook.config.ts \
 *   e2e/visual/row-actions-reveal.storybook.spec.ts
 * ```
 */
import { expect, test, type Page } from '@playwright/test'

import { STORYBOOK_URL } from './storybook-url.js'

const SB = STORYBOOK_URL

/** The story showing a table row with edit, delete and an overflow on it. */
const TABLE_STORY = 'blocks-table-data-table--reveal-on-hover'
/**
 * A table whose rows have no verb at all -- no expand, no edit, no delete.
 * The whole offer is `Copy <label>` from the `...`, which is the shape the
 * picker's library, accounts and languages panes have.
 */
const MENU_ONLY_STORY = 'blocks-table-data-table--menu-only-row'
/** The gallery timeline, whose rows are `<li>` rather than a React Aria row. */
const TIMELINE_STORY = 'screens-case-timeline--populated'

/** Whether a Storybook is listening, asked once. */
async function storybookIsUp(): Promise<boolean> {
  try {
    const answer = await fetch(`${SB}/index.json`, { signal: AbortSignal.timeout(5_000) })
    return answer.ok
  } catch {
    return false
  }
}

async function openStory(page: Page, id: string): Promise<void> {
  await page.goto(`${SB}/iframe.html?id=${id}&viewMode=story`, {
    waitUntil: 'load',
    timeout: 20_000,
  })
  await page.locator('#storybook-root').waitFor({ state: 'attached', timeout: 10_000 })
}

/**
 * The cluster's rendered opacity, as the browser computes it.
 *
 * A number rather than a string, so a reading of `0.5` mid-transition fails
 * the comparison it is nearest to rather than silently reading as neither.
 */
async function opacityOf(page: Page, at: number): Promise<number> {
  const cluster = page.locator('[data-slot="row-actions"]').nth(at)
  return Number(await cluster.evaluate((node) => getComputedStyle(node).opacity))
}

test.describe('a row hands over its actions', () => {
  test.beforeEach(async () => {
    test.skip(!(await storybookIsUp()), `no Storybook at ${SB} - run \`cd ui && npm run storybook\``)
  })

  test('the table row reveals its cluster to a pointer and hides it again', async ({ page }) => {
    await openStory(page, TABLE_STORY)
    const row = page.locator('[data-row-id]').first()
    await row.waitFor({ state: 'visible' })

    // Rest. The pointer starts at (0,0), which is outside the story.
    await expect.poll(async () => opacityOf(page, 0)).toBe(0)

    await row.hover()
    // React Aria sets `data-hovered` itself, and only on a row it considers
    // interactive. Asserted beside the opacity, because a reveal that came
    // from anywhere else would be the bracketed-variant escape hatch this
    // fix exists to avoid.
    await expect(row).toHaveAttribute('data-hovered', 'true')
    await expect.poll(async () => opacityOf(page, 0)).toBe(1)

    // Off the row again: onto the header, which is inside the table and not a
    // row, so this cannot pass by the pointer merely leaving the page.
    await page.locator('[data-slot="table-header"]').hover()
    await expect(row).not.toHaveAttribute('data-hovered', 'true')
    await expect.poll(async () => opacityOf(page, 0)).toBe(0)
  })

  test('a hovered row reveals only its own cluster', async ({ page }) => {
    await openStory(page, TABLE_STORY)
    await page.locator('[data-row-id]').first().hover()
    await expect.poll(async () => opacityOf(page, 0)).toBe(1)
    // The second row's controls belong to a row nobody is pointing at.
    await expect.poll(async () => opacityOf(page, 1)).toBe(0)
  })

  test('the keyboard reveals the cluster it lands in', async ({ page }) => {
    await openStory(page, TABLE_STORY)
    await page.locator('[data-row-id]').first().waitFor({ state: 'visible' })
    await expect.poll(async () => opacityOf(page, 0)).toBe(0)

    // Tab first, so the browser's own heuristic counts the modality as
    // keyboard and `:focus-visible` applies to what is focused next. A
    // pointer-driven focus deliberately does not reveal anything.
    await page.keyboard.press('Tab')
    await page.getByRole('button', { name: /^Edit / }).first().focus()

    await expect.poll(async () => opacityOf(page, 0)).toBe(1)
  })

  test('a ticked row keeps its cluster on screen with no pointer near it', async ({ page }) => {
    // Two rows ticked, and the pointer at (0,0). The reveal has to come from
    // the selection alone -- it is what says the row is one of the ones the
    // bulk bar is about to act on.
    await openStory(page, 'blocks-table-data-table--selection')
    await page.locator('[data-row-id]').first().waitFor({ state: 'visible' })

    await expect.poll(async () => opacityOf(page, 0)).toBe(1)
    // The third row is not in the selection, so nothing reveals it.
    await expect.poll(async () => opacityOf(page, 2)).toBe(0)
  })

  test('pressing the row does not tick its checkbox', async ({ page }) => {
    await openStory(page, TABLE_STORY)
    const row = page.locator('[data-row-id]').first()
    const box = row.locator('input[type="checkbox"]').first()
    await expect(box).not.toBeChecked()

    // The row's own action fires here, and selection is a separate gesture:
    // `selectionBehavior` is toggle, so only the box selects.
    await row.getByRole('rowheader').click()

    await expect(box).not.toBeChecked()
  })

  /**
   * The right click is a shortcut onto the same list the `...` carries, which
   * is what `context-menu`'s additive rule means. Compared item for item
   * rather than counted: a menu with the same number of different rows reads
   * as correct in a screenshot and is the defect.
   */
  test('a right click on a row opens the same items its overflow carries', async ({ page }) => {
    await openStory(page, TABLE_STORY)
    const row = page.locator('[data-row-id]').first()
    await row.waitFor({ state: 'visible' })

    await row.hover()
    await page.getByRole('button', { name: /^More for / }).first().click()
    const fromOverflow = await page.getByRole('menuitem').allInnerTexts()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menuitem').first()).toBeHidden()

    await row.getByRole('rowheader').click({ button: 'right' })
    // The texts are collected so two menus can be compared with each other,
    // which a web-first assertion cannot express.
    // eslint-disable-next-line playwright/prefer-web-first-assertions
    const fromRightClick = await page.getByRole('menuitem').allInnerTexts()

    expect(fromRightClick.length).toBeGreaterThan(0)
    expect(fromRightClick).toEqual(fromOverflow)

    // And it opens where the pointer is. A menu that opened at the corner of
    // the table would pass every assertion above.
    const cell = await row.getByRole('rowheader').boundingBox()
    const menu = await page.getByRole('menu').boundingBox()
    if (!cell || !menu) throw new Error('the row or its menu has no box')
    expect(Math.abs(menu.x - (cell.x + cell.width / 2))).toBeLessThan(80)
    expect(Math.abs(menu.y - (cell.y + cell.height / 2))).toBeLessThan(80)
  })

  test('a right click on a timeline row opens the same items its overflow carries', async ({
    page,
  }) => {
    await openStory(page, TIMELINE_STORY)
    const row = page.locator('[data-slot="timeline-row"]').first()
    await row.waitFor({ state: 'visible' })

    await row.hover()
    await page.getByRole('button', { name: /^More for / }).first().click()
    const fromOverflow = await page.getByRole('menuitem').allInnerTexts()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menuitem').first()).toBeHidden()

    await row.click({ button: 'right' })
    // The texts are collected so two menus can be compared with each other,
    // which a web-first assertion cannot express.
    // eslint-disable-next-line playwright/prefer-web-first-assertions
    const fromRightClick = await page.getByRole('menuitem').allInnerTexts()

    expect(fromRightClick.length).toBeGreaterThan(0)
    expect(fromRightClick).toEqual(fromOverflow)
  })

  /**
   * `EntityDialog` shouts in DEV when a reference field's collection was not
   * handed any options, because an absent map and an empty case render the
   * same screen: every chip on a saved row reading "(missing reference)" over
   * a row that exists.
   */
  test('the new-event dialog is given options for every collection it references', async ({
    page,
  }) => {
    const shouted: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error' && message.text().includes('[EntityDialog]')) {
        shouted.push(message.text())
      }
    })

    await openStory(page, TIMELINE_STORY)
    await page.getByRole('button', { name: 'New event' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    expect(shouted).toEqual([])
  })

  /**
   * A row whose only offer is its menu, which is where the reveal runs out.
   *
   * React Aria gives `data-hovered` to a row it considers interactive and to
   * no other, and interactive means having an `onAction`; a row with no verb
   * has none, so its cluster is compiled correct, painted at `opacity: 0` and
   * unreachable by pointer. The row's action is its own menu. The
   * `data-hovered` assertion is beside the opacity deliberately: a reveal
   * arriving from a bracketed CSS escape hatch would pass the opacity check
   * while asserting a row is hoverable that React Aria believes is not.
   */
  test('a row whose only offer is its menu reveals its cluster to a pointer', async ({
    page,
  }) => {
    await openStory(page, MENU_ONLY_STORY)
    const row = page.locator('[data-row-id]').first()
    await row.waitFor({ state: 'visible' })

    // The cluster is there, and it is a menu button and nothing else.
    await expect(page.getByRole('button', { name: /^More for / }).first()).toBeAttached()
    await expect(page.getByRole('button', { name: /^Edit / })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Delete / })).toHaveCount(0)

    await expect.poll(async () => opacityOf(page, 0)).toBe(0)

    await row.hover()
    await expect(row).toHaveAttribute('data-hovered', 'true')
    await expect.poll(async () => opacityOf(page, 0)).toBe(1)
    // The row below is pointed at by nobody.
    await expect.poll(async () => opacityOf(page, 1)).toBe(0)

    await page.locator('[data-slot="table-header"]').hover()
    await expect(row).not.toHaveAttribute('data-hovered', 'true')
    await expect.poll(async () => opacityOf(page, 0)).toBe(0)
  })

  /**
   * Pressing the row opens that row's menu, and the cluster the menu is
   * anchored to stays on screen once the pointer has left it. A popover
   * hanging off a control at `opacity: 0` points at nothing.
   */
  test('pressing a menu-only row opens its own menu, and holds the cluster open', async ({
    page,
  }) => {
    await openStory(page, MENU_ONLY_STORY)
    const row = page.locator('[data-row-id]').first()
    await row.waitFor({ state: 'visible' })
    const label = (await row.getByRole('rowheader').innerText()).trim()

    await row.getByRole('rowheader').click()

    await expect(page.getByRole('menu')).toBeVisible()
    await expect(page.getByRole('menu')).toHaveAccessibleName(`More for ${label}`)
    await expect(page.getByRole('menuitem', { name: `Copy ${label}` })).toBeVisible()

    // The pointer off the row, past the popover's underlay -- `hover()` would
    // be refused by it. The reveal that survives is the open menu's own.
    await page.mouse.move(4, 4)
    await expect(page.getByRole('menu')).toBeVisible()
    await expect.poll(async () => opacityOf(page, 0)).toBe(1)
    // And no other row's.
    await expect.poll(async () => opacityOf(page, 1)).toBe(0)
  })

  /**
   * The `...` is a controlled trigger, so a press that also reached the row's
   * action would toggle it twice and leave it shut. One press, one menu.
   */
  test('the overflow on a menu-only row opens once, not twice', async ({ page }) => {
    await openStory(page, MENU_ONLY_STORY)
    const row = page.locator('[data-row-id]').first()
    await row.waitFor({ state: 'visible' })

    await row.hover()
    await page.getByRole('button', { name: /^More for / }).first().click()

    await expect(page.getByRole('menu')).toHaveCount(1)
    await expect(page.getByRole('menu')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toHaveCount(0)
  })

  /**
   * The additive rule, on the rows that put it under the most strain: the
   * menu is the only surface these rows have, and the right click and the
   * `...` still have to be one list.
   */
  test('a menu-only row offers the same list by right click as by overflow', async ({ page }) => {
    await openStory(page, MENU_ONLY_STORY)
    const row = page.locator('[data-row-id]').first()
    await row.waitFor({ state: 'visible' })

    await row.hover()
    await page.getByRole('button', { name: /^More for / }).first().click()
    const fromOverflow = await page.getByRole('menuitem').allInnerTexts()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menuitem').first()).toBeHidden()

    await row.getByRole('rowheader').click({ button: 'right' })
    // The texts are collected so two menus can be compared with each other,
    // which a web-first assertion cannot express.
    // eslint-disable-next-line playwright/prefer-web-first-assertions
    const fromRightClick = await page.getByRole('menuitem').allInnerTexts()

    expect(fromRightClick.length).toBeGreaterThan(0)
    expect(fromRightClick).toEqual(fromOverflow)
  })

  test('the timeline row reveals its cluster to a pointer', async ({ page }) => {
    await openStory(page, TIMELINE_STORY)
    const row = page.locator('[data-slot="timeline-row"]').first()
    await row.waitFor({ state: 'visible' })

    await expect.poll(async () => opacityOf(page, 0)).toBe(0)
    await row.hover()
    await expect.poll(async () => opacityOf(page, 0)).toBe(1)
    await page.locator('[data-slot="timeline-day"]').first().hover()
    await expect.poll(async () => opacityOf(page, 0)).toBe(0)
  })
})
