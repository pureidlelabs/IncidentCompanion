/**
 * The kit's interaction states, as the browser paints them.
 *
 * A state variant is a claim about what a control does under a pointer, a
 * press and a keyboard, and reading the class string cannot settle it: React
 * Aria calls `preventDefault` on pointer down, so a native `active:` never
 * fires on its buttons, and a native `hover:` lights a disabled item that
 * `data-hovered` leaves alone. So each story here is driven and its computed
 * style read back at rest, hovered, pressed and focused.
 *
 * What it asserts, per control:
 * - hovering a live control changes its paint, and hovering a disabled one
 *   does not;
 * - pressing changes it again, where the kit declares a pressed look;
 * - reaching it by keyboard draws a ring.
 */
import { expect, test, type ElementHandle, type Page } from '@playwright/test'

import { STORYBOOK_URL } from './storybook-url.js'

const SB = STORYBOOK_URL

interface Probe {
  story: string
  /** The control under test, inside the story root. */
  target: string
  /** Whether the kit paints a pressed state on it. */
  pressed: boolean
  /** A disabled twin, when the story family has one. */
  disabled?: { story: string; target: string }
}

/**
 * Selection stories where a story family has one: React Aria tracks hover
 * and press only on an item that can be selected or acted on, so a static
 * list is correctly inert and proves nothing.
 */
const PROBES: Probe[] = [
  {
    story: 'components-button--default',
    target: 'button',
    pressed: true,
    disabled: { story: 'components-button--disabled', target: 'button' },
  },
  { story: 'components-togglebutton--single', target: 'button', pressed: true },
  {
    story: 'components-listbox--single-selection',
    target: '[role="option"]:not([aria-selected="true"])',
    pressed: true,
    disabled: {
      story: 'components-listbox--disabled-items',
      target: '[role="option"][aria-disabled="true"]',
    },
  },
  {
    story: 'components-gridlist--single-selection',
    target: '[role="row"]:not([aria-selected="true"])',
    pressed: true,
  },
  {
    story: 'components-tree--single-selection',
    target: '[role="row"]:not([aria-selected="true"])',
    pressed: true,
  },
  { story: 'components-tabs--default', target: '[role="tab"]:not([aria-selected="true"])', pressed: false },
  { story: 'components-link--default', target: 'a', pressed: false },
  { story: 'components-select--default', target: 'button', pressed: false },
  {
    story: 'components-calendar--default',
    target: '[role="gridcell"] > *:not([aria-disabled="true"])',
    pressed: true,
  },
]

const PAINT = [
  'background-color',
  'color',
  'text-decoration-line',
  'box-shadow',
  'outline-style',
  'outline-width',
  'border-color',
  'transform',
]

/**
 * The control's paint once it has stopped changing.
 *
 * Every kit transition is under 300ms; a reading taken mid-way is the colour
 * between two states and equals neither, which reads as a state that never
 * arrived.
 */
async function paint(
  page: Page,
  target: ElementHandle<Element>,
): Promise<Record<string, string>> {
  const read = () =>
    target.evaluate((el, props) => {
      const style = getComputedStyle(el)
      return Object.fromEntries(props.map((prop) => [prop, style.getPropertyValue(prop)]))
    }, PAINT)
  let last = await read()
  for (let i = 0; i < 8; i += 1) {
    await page.waitForTimeout(120)
    const next = await read()
    if (PAINT.every((prop) => next[prop] === last[prop])) return next
    last = next
  }
  return last
}

function differs(a: Record<string, string>, b: Record<string, string>): boolean {
  return PAINT.some((prop) => a[prop] !== b[prop])
}

async function open(page: Page, story: string): Promise<void> {
  // eslint-disable-next-line playwright/no-networkidle -- `view.ts` says why the tier keeps it
  await page.goto(`${SB}/iframe.html?id=${story}&viewMode=story`, { waitUntil: 'networkidle' })
  await page.locator('#storybook-root').waitFor()
  // Park the pointer where nothing is, so the first reading is at rest. A
  // story's own `play` may have just pressed the control.
  await page.mouse.move(2, 2)
  await page.mouse.click(2, 2)
}

async function storybookIsUp(): Promise<boolean> {
  try {
    const answer = await fetch(`${SB}/index.json`, { signal: AbortSignal.timeout(5_000) })
    return answer.ok
  } catch {
    return false
  }
}

test.describe('a control paints its states', () => {
  test.beforeAll(async () => {
    test.skip(!(await storybookIsUp()), `no Storybook at ${SB}`)
  })

  for (const probe of PROBES) {
    test(`${probe.story} answers the pointer, the press and the keyboard`, async ({ page }) => {
      await open(page, probe.story)
      // Pinned to one element: a press that selects the row would move a
      // selector such as `:not([aria-selected])` onto its neighbour.
      const found = page.locator(`#storybook-root ${probe.target}`).first()
      await found.waitFor()
      const target = (await found.elementHandle()) as ElementHandle<Element>

      const rest = await paint(page, target)
      await target.hover()
      const hovered = await paint(page, target)
      expect(differs(rest, hovered), `hover changed nothing on ${probe.target}`).toBe(true)

      if (probe.pressed) {
        await page.mouse.down()
        const pressed = await paint(page, target)
        await page.mouse.up()
        expect(differs(rest, pressed), `pressing changed nothing on ${probe.target}`).toBe(true)
      }

      // A key press first, so React Aria reads the modality as keyboard and
      // the focus that follows is a visible one.
      await page.mouse.move(2, 2)
      await page.mouse.click(2, 2)
      await page.keyboard.press('Tab')
      await target.focus()
      const focused = await paint(page, target)
      const ringed =
        (focused['outline-style'] !== 'none' && focused['outline-width'] !== '0px') ||
        focused['box-shadow'] !== rest['box-shadow']
      expect(ringed, `keyboard focus drew no ring on ${probe.target}`).toBe(true)
    })

    if (probe.disabled) {
      const twin = probe.disabled
      test(`${twin.story} ignores the pointer`, async ({ page }) => {
        await open(page, twin.story)
        const found = page.locator(`#storybook-root ${twin.target}`).first()
        await found.waitFor()
        const target = (await found.elementHandle()) as ElementHandle<Element>
        const rest = await paint(page, target)
        await target.hover({ force: true })
        const hovered = await paint(page, target)
        expect(differs(rest, hovered), `a disabled ${twin.target} lit under the pointer`).toBe(false)
      })
    }
  }
})
