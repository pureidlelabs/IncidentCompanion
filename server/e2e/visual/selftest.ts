/**
 * Break the page seven ways on purpose and check each probe fires.
 *
 * **A sweep reporting "no findings" means nothing unless the probes can still
 * bite** - the same discipline as reverting a fix to watch its test fail. This
 * caught two real defects in the probe within minutes of first being written,
 * one of which silently disabled the whole `offscreen` check whenever the page
 * scrolled sideways.
 *
 * **Run it after touching `probe.js` - or the section action row's markup.**
 * The second trigger is the one that bites: every fault is injected into that
 * row or a rail label, so a markup change there makes a mutation throw and the
 * run dies having asserted nothing, after an edit that touched neither this
 * file nor the probe. Nothing else catches it - the unit suite, the specs and
 * a full sweep all stay green, because none of them runs this.
 *
 * **Porting it to the Python React tier cost three of the seven**, which is
 * the argument for running it rather than trusting it: the faults were written
 * against a header at the top of the page, and the action row sits near
 * x=1150, y=89, so `right:40px;top:8px` landed on empty background and
 * `overlap`, `offscreen` and `low-contrast` all reported "nothing fired". They
 * are positioned from the first button's live rect now.
 */
import type { Browser } from '@playwright/test'

import { ADMIN, asPersona, openFirstCase, section } from '../support/app.js'

import type { FindingKind } from './probe.js'
import { findings, quiesce } from './view.js'

/**
 * The section every geometry fault is injected into.
 *
 * **Timeline, because `overlap` needs two controls in that row** and it has
 * two.
 */
const SELFTEST_SECTION = 'timeline'

/**
 * The section's action row.
 *
 * **`main [role="toolbar"]` matches dozens and the first is the one** - every
 * editable row carries its own toolbar, so a count is not a way to find the
 * section's. The first in document order is, and it is the only one above the
 * table.
 */
const ROW = 'main [role="toolbar"]'

/** A rail row's label, for the text faults: the `span` beside the icon. */
const LABEL = '[data-testid^="rail-row-"] span'

interface Fault {
  kind: FindingKind
  why: string
  break: (selectors: { row: string; label: string }) => void
}

const FAULTS: Fault[] = [
  {
    kind: 'h-scroll',
    why: 'a 3000px block on a 1440px page',
    break: () => {
      const wide = document.createElement('div')
      wide.style.cssText = 'position:absolute;left:0;top:0;width:3000px;height:4px'
      document.body.appendChild(wide)
    },
  },
  {
    kind: 'clipped-text',
    why: 'a label cut to 12px with no ellipsis',
    break: ({ label }) => {
      const el = document.querySelector<HTMLElement>(label)
      if (!el) throw new Error(`no element for ${label}`)
      el.style.cssText =
        'display:block;width:12px;overflow:hidden;text-overflow:clip;white-space:nowrap'
    },
  },
  {
    // **Positioned from the first button's live rect, not a fixed offset.**
    // Fixed offsets land on empty background on this frame, and all three of
    // the faults using them reported "nothing fired" on the first port.
    kind: 'overlap',
    why: 'the last toolbar button moved on top of the first',
    break: ({ row }) => {
      const toolbar = document.querySelector(row)
      if (!toolbar) throw new Error(`no element for ${row}`)
      const buttons = toolbar.querySelectorAll<HTMLElement>('button')
      const first = buttons[0]
      const last = buttons[buttons.length - 1]
      if (!first || !last || first === last) throw new Error('the action row needs two buttons')

      /**
       * **Taken out of flow *before* the target is measured, because removing
       * it moves the target.** The row is right-anchored in its parent, so
       * taking any item out of flow drags the survivors rightward - measured,
       * `first` sat at x=1162 before and x=1280 after, and a `last` pinned to
       * the old rect ended at 1279: **adjacent by one pixel, not overlapping**.
       * The probe was right to report nothing; the fault had missed.
       *
       * **Not the button count**, which is the tempting reading and is wrong in
       * both directions: measured at three buttons the survivors still move and
       * the fix still lands, and in a left-anchored row nothing moves and the
       * old code would have worked.
       */
      last.style.position = 'fixed'
      const over = first.getBoundingClientRect()
      last.style.cssText =
        `position:fixed;left:${String(over.left)}px;top:${String(over.top)}px;` +
        `width:${String(over.width)}px;height:${String(over.height)}px`

      /**
       * **The fault asserts it landed, which is the general fix.** A fault that
       * misses is reported by the selftest as `fired: false`, whose message
       * sends the reader to the probe - so a live probe reads as a dead one,
       * which is exactly the session this cost. Two independent spellings of
       * `position:fixed` hold the pin (the property above and the `cssText`
       * that overwrites it), and changing either silently restores the miss.
       */
      const pinned = last.getBoundingClientRect()
      const settled = first.getBoundingClientRect()
      if (Math.min(settled.right, pinned.right) - Math.max(settled.left, pinned.left) <= 2) {
        throw new Error('the overlap fault did not land on the first button')
      }
    },
  },
  {
    /**
     * **A control over a padded input's *text*, which the padding rule must not
     * excuse.** `paintedRects` clamps a text field to its content box, so an
     * inset trigger sitting in the field's own `pr-9` is no longer reported -
     * the shape `datetime-input.tsx` draws on eleven screens. The cheap way to
     * write that clamp is to drop inputs from the check, or to clamp to the
     * padding box, and both leave a button laid across the typed value silent.
     *
     * The button covers the field's right 60px: 36 of padding, which the rule
     * forgives, and 24 of content, which it must not.
     */
    kind: 'overlap',
    why: 'a button across a padded field\u2019s content, which its padding does not excuse',
    break: ({ row }) => {
      const toolbar = document.querySelector(row)
      if (!toolbar) throw new Error(`no element for ${row}`)
      const field = document.createElement('input')
      field.type = 'text'
      field.style.cssText =
        'position:fixed;left:300px;top:300px;width:160px;height:32px;' +
        'padding:0 36px 0 10px;border:1px solid #888;margin:0'
      toolbar.appendChild(field)
      const over = document.createElement('button')
      over.type = 'button'
      over.textContent = 'over'
      over.style.cssText = 'position:fixed;left:402px;top:300px;width:60px;height:32px;margin:0'
      toolbar.appendChild(over)

      // The fault asserts it landed on the *content*, not merely on the box:
      // pinned to the padding alone it would be the non-defect this rule is
      // there to forgive, and the probe reporting nothing would be correct.
      const style = getComputedStyle(field)
      const box = field.getBoundingClientRect()
      const contentRight = box.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight)
      if (contentRight - over.getBoundingClientRect().left <= 2) {
        throw new Error('the fault sits in the padding, which is not an overlap')
      }
    },
  },
  {
    // `fixed`, so the offset parent is the viewport and no scrollable ancestor
    // can excuse it - the probe asks whether an ancestor scrolls, and an
    // absolutely-positioned control inside the pane has one.
    kind: 'offscreen',
    why: 'a button pushed past the right edge, outside anything scrollable',
    break: ({ row }) => {
      const button = document.querySelector<HTMLElement>(`${row} button`)
      if (!button) throw new Error(`no button in ${row}`)
      button.style.cssText =
        `position:fixed;left:${String(window.innerWidth - 20)}px;top:200px;width:200px;height:40px`
    },
  },
  {
    // **The rail label, because the action row has no element leaf to
    // measure.** The rule skips anything with element children, and a toolbar
    // button holds its text as a bare text node beside an `<svg>` - so the
    // button is skipped and there is no descendant to fall back to.
    //
    // Its own background as well as its colour: the ground is read from the
    // element itself, so setting both is 1.00:1 by construction rather than by
    // hoping whatever sits underneath happens to match.
    kind: 'low-contrast',
    why: 'a label painted on its own colour, 1.00:1',
    break: ({ label }) => {
      const el = document.querySelector<HTMLElement>(label)
      if (!el) throw new Error(`no element for ${label}`)
      el.style.color = 'rgb(120, 120, 120)'
      el.style.backgroundColor = 'rgb(120, 120, 120)'
      el.style.opacity = '1'
    },
  },
  {
    kind: 'small-target',
    why: 'a 14px button',
    break: ({ row }) => {
      const button = document.querySelector<HTMLElement>(`${row} button`)
      if (!button) throw new Error(`no button in ${row}`)
      button.style.cssText = 'width:14px;height:14px;min-width:0;min-height:0;padding:0'
    },
  },
  {
    // A label-wrapped input that is small *including* its label. The rule
    // measuring the label instead of the input must still fire here, or the
    // exemption swallows the real case along with the phantom.
    kind: 'small-target',
    why: 'a 14px checkbox inside a 14px label, so the label exemption cannot excuse it',
    break: ({ row }) => {
      const toolbar = document.querySelector(row)
      if (!toolbar) throw new Error(`no element for ${row}`)
      // **The input has to be shrunk too, and that is the whole fault.** The
      // probe measures a label-wrapped control at `max(input, label)`, so a
      // 14px label around a default 175x24 input is legitimately above the
      // floor - the mutation applies, nothing fires, and it reads as a broken
      // probe rather than a wrong fault. `flex:0 0 14px` because the row is a
      // flex row, where a bare `width` is a hint it can override.
      const label = document.createElement('label')
      label.style.cssText = 'display:block;flex:0 0 14px;width:14px;height:14px;padding:0'
      const box = document.createElement('input')
      box.style.cssText = 'display:block;width:14px;height:14px;min-width:0;padding:0;margin:0'
      label.appendChild(box)
      toolbar.appendChild(label)
    },
  },
]

export interface SelftestResult {
  kind: FindingKind
  why: string
  fired: boolean
  error?: string
}

/**
 * Each fault on a freshly reloaded page, because a fault is not undone.
 *
 * **Reloading rather than restoring what was changed.** A restore that
 * silently missed would leave the next fault's page already broken, and the
 * finding it then reports is about the *previous* mutation - which passes, and
 * proves nothing.
 *
 * **The case is opened once and the reload is a `goto` of its URL.**
 * `openFirstCase` starts at the picker, and after the first fault the page is
 * inside the case - so calling it per fault looks for a case table that is not
 * on screen and fails on the second iteration with the first one's page state
 * in the report.
 */
export async function selftest(browser: Browser): Promise<SelftestResult[]> {
  const out: SelftestResult[] = []
  const { context, page } = await asPersona(browser, ADMIN)
  try {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openFirstCase(page)
    await section(page, SELFTEST_SECTION)
    const where = page.url()
    for (const fault of FAULTS) {
      await page.goto(where)
      await quiesce(page)
      try {
        await page.evaluate(fault.break, { row: ROW, label: LABEL })
      } catch (cause) {
        // A fault that will not apply is the failure this file exists to
        // report - it means the markup moved, and a run that swallowed it
        // would assert nothing while looking clean.
        out.push({
          kind: fault.kind,
          why: fault.why,
          fired: false,
          error: `the fault would not apply: ${String(cause)}`,
        })
        continue
      }
      // One pass: the mutation is applied and static, so the three-pass
      // agreement filter would only cost three settles per fault.
      const found = await findings(page, null, 1)
      out.push({
        kind: fault.kind,
        why: fault.why,
        fired: found.some((one) => one.kind === fault.kind),
      })
    }
  } finally {
    await context.close()
  }
  return out
}
