/**
 * **Every screen, walked with Tab alone.**
 *
 * *Every control MUST be operable without a pointing device*, and the
 * scenario under it is *the interface is used without a pointer*. jsdom
 * cannot answer it, since every element there has a zero box and no tab
 * order; axe checks semantics rather than traversal. This is the tier with a
 * real focus order, so this is where the claim is held.
 *
 * Per screen, with the shell around it: focus the document, press Tab until
 * focus comes back round or leaves to the body, and compare what was reached
 * against every element the screen holds that is tabbable, visible and not
 * hidden from assistive technology. What a roving tabindex keeps at `-1` is
 * not tabbable by design, so a grid's second row is reached by an arrow and is
 * not what this counts. Focus leaving is asserted too: a walk that ends inside
 * a control is a trap.
 *
 * **The screens are discovered, never listed**, for `sections.spec.ts`'s
 * reason: a screen added tomorrow is covered by nothing while a literal list
 * still reports clean.
 */
import { expect, test, type Page } from '@playwright/test'

import {
  ADMIN,
  asPersona,
  ensureAnalyst,
  ensureCase,
  openFirstCase,
  openPane,
  panes,
  section,
  sections,
  settle,
} from './support/app.js'

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ browser, baseURL }) => {
  await ensureAnalyst(browser, baseURL ?? '')
  await ensureCase(browser, baseURL ?? '')
})

/** Enough presses to cross any screen here twice; a walk that needs more is looping. */
const CAP = 600

interface Walk {
  /** Tabbable, visible controls the screen holds, by a name a reader can find. */
  expected: string[]
  /** The ones Tab reached. */
  reached: string[]
  /** Where focus stood when the walk stopped. */
  endedOn: string
}

/**
 * Mark every candidate with an index, so the walk can name what it reached
 * without depending on a selector that a re-render would break.
 */
async function mark(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const SELECTOR =
      'a[href], button, input, select, textarea, summary, [contenteditable="true"], [tabindex]'
    // A composite is one tab stop whose inside the arrow keys walk, so Tab
    // entering it is what reaching it means; its children are not counted.
    const COMPOSITE = [
      '[role="grid"]',
      '[role="treegrid"]',
      '[role="listbox"]',
      '[role="tree"]',
      '[role="menu"]',
      '[role="menubar"]',
      '[role="tablist"]',
      '[role="radiogroup"]',
      '[role="toolbar"]',
    ].join(',')
    const label = (el: Element): string => {
      const name =
        el.getAttribute('aria-label') ??
        el.getAttribute('title') ??
        (el as HTMLElement).innerText?.trim().split('\n')[0] ??
        ''
      const role = el.getAttribute('role') ?? el.tagName.toLowerCase()
      return `${role} "${name.slice(0, 40)}"`
    }
    const out: string[] = []
    let n = 0
    for (const el of document.querySelectorAll('[data-kb]')) el.removeAttribute('data-kb')
    const shown = (el: HTMLElement): boolean => {
      if (el.closest('[inert]') || el.closest('[aria-hidden="true"]')) return false
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') return false
      const box = el.getBoundingClientRect()
      return box.width > 0 || box.height > 0
    }
    for (const el of document.querySelectorAll<HTMLElement>(COMPOSITE)) {
      if (!shown(el) || el.parentElement?.closest(COMPOSITE)) continue
      el.setAttribute('data-kb', String(n))
      out.push(`${String(n)}:${label(el)}`)
      n += 1
    }
    for (const el of document.querySelectorAll<HTMLElement>(SELECTOR)) {
      if (el.closest(COMPOSITE)) continue
      const tabindex = el.getAttribute('tabindex')
      if (tabindex !== null && Number(tabindex) < 0) continue
      if ((el as HTMLButtonElement).disabled || !shown(el)) continue
      el.setAttribute('data-kb', String(n))
      out.push(`${String(n)}:${label(el)}`)
      n += 1
    }
    return out
  })
}

async function walk(page: Page): Promise<Walk> {
  const expected = await mark(page)
  await page.evaluate(() => {
    ;(document.activeElement as HTMLElement | null)?.blur()
  })
  const reached = new Set<string>()
  // The walk starts wherever the last click left the sequential focus point,
  // so it runs to the end, leaves to the body once, and comes round from the
  // top until it meets something it has seen.
  let left = false
  let endedOn = 'body'
  for (let press = 0; press < CAP; press += 1) {
    await page.keyboard.press('Tab')
    const now = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return 'body'
      const id = el.closest('[data-kb]')?.getAttribute('data-kb')
      return id === undefined || id === null ? `unmarked:${el.tagName.toLowerCase()}` : id
    })
    if (now === 'body') {
      if (left) break
      left = true
      continue
    }
    if (reached.has(now)) {
      endedOn = left ? 'body' : now
      break
    }
    reached.add(now)
  }
  const names = new Map(expected.map((one) => [one.split(':')[0]!, one]))
  return {
    expected,
    reached: [...reached].map((id) => names.get(id) ?? id),
    endedOn: left ? 'body' : endedOn,
  }
}

/**
 * Walk once, and once more if that found a fault: a walk over a settled page
 * is deterministic, so a second reading that disagrees with the first was a
 * render arriving mid-walk rather than a control the keyboard cannot reach.
 */
async function walkTwice(page: Page): Promise<Walk> {
  const first = await walk(page)
  const clean = (one: Walk) =>
    one.endedOn === 'body' && one.expected.every((each) => one.reached.includes(each))
  if (clean(first)) return first
  await settle(page, 8000)
  return walk(page)
}

/** The screens and what each failed, or nothing. */
function judge(where: string, result: Walk, faults: string[]): void {
  const missed = result.expected.filter((one) => !result.reached.includes(one))
  if (missed.length > 0) {
    faults.push(
      `${where}: Tab never reached ${missed.join(', ')} (walked ${String(result.reached.length)} of ` +
        `${String(result.expected.length)}, ended on ${result.endedOn}; order: ${result.reached
          .map((one) => one.split(':')[0])
          .join(' ')})`,
    )
  }
  if (result.endedOn !== 'body')
    faults.push(`${where}: focus never left, it came back round to ${result.endedOn}`)
}

test('every screen can be reached, used and left from the keyboard', async ({ browser }) => {
  test.setTimeout(600_000)
  const { context, page } = await asPersona(browser, ADMIN)
  const faults: string[] = []
  const walked: string[] = []
  try {
    for (const slug of await panes(page)) {
      await openPane(page, slug)
      await settle(page, 8000)
      judge(`picker/${slug}`, await walkTwice(page), faults)
      walked.push(`picker/${slug}`)
    }

    // Back to the cases list, which is where the first case is opened from.
    await openPane(page, 'cases')
    await openFirstCase(page)
    const rail = await sections(page)
    expect(rail.length, 'the case rail offered almost nothing').toBeGreaterThan(4)
    for (const { slug } of rail) {
      await section(page, slug)
      await settle(page, 8000)
      judge(slug, await walkTwice(page), faults)
      walked.push(slug)
    }
  } finally {
    await context.close()
  }
  test.info().annotations.push({
    type: 'screens',
    description: `${String(walked.length)}: ${walked.join(', ')}`,
  })
  expect(faults, 'screens the keyboard cannot fully use').toEqual([])
})
