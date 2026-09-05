/**
 * The entity create dialogs, captured open.
 *
 * **The sweep cannot reach these.** It walks the rail and shoots each section
 * as a fresh page, so every dialog in the app is outside what it can see --
 * named in the `visual-check` skill as not covered. This drives the Add door
 * on the sections whose fields changed and captures the dialog element rather
 * than the viewport, so the image is the control set rather than a page with a
 * scrim over it.
 *
 * **A case with rows, not the empty fixture.** `ensureCase` mints an empty one,
 * which is right for a layout sweep and useless here: a dialog opened on an
 * empty case still draws its fields, but the table behind it says nothing
 * about the column set that changed.
 */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import {
  ADMIN,
  asAdminApi,
  asPersona,
  closeDialog,
  requireServedApp,
  section,
  settle,
} from '../support/app.js'
import { setGround, shoot, quiesce, type Ground } from './view.js'

const OUT = join(process.cwd(), '.visual', 'dialogs')

/**
 * The doors whose field set this branch changed.
 */
const DOORS: { slug: string; button?: string | RegExp; name: string }[] = [
  { slug: 'network', button: 'Add network', name: 'indicator' },
  { slug: 'malware', button: 'Add malware', name: 'malware' },
  { slug: 'cloud-apps', button: 'Add cloud app', name: 'cloud-app' },
  // The form the served tier fixed: `collectedAt` is the *when* of a chain of
  // custody, and the heuristic folded it away from the `collectedBy` beside it.
  { slug: 'evidence', name: 'evidence' },
  { slug: 'impact', name: 'impact' },
  // The stress case: the most fields of any form, and the one dialog still
  // laid out in columns.
  { slug: 'timeline', button: /New event/i, name: 'event' },
  // The two-pane picker, which the sweep cannot reach and which no other
  // tier lays out - jsdom gives its rail and its list a zero box each.
  { slug: 'report', button: /New report/i, name: 'new-report' },
]

const GROUNDS = (process.env['VISUAL_GROUNDS'] ?? 'light,dark').split(',') as Ground[]

test('captures every create dialog this branch touched', async ({ browser, baseURL }) => {
  await requireServedApp(baseURL ?? '')
  await mkdir(OUT, { recursive: true })

  const { page } = await asPersona(browser, ADMIN)
  await page.setViewportSize({ width: 1440, height: 900 })
  // **A demo case, because it is the one with real content in it.** An empty
  // fixture draws every dialog blank, which says nothing about the surface an
  // analyst uses -- correcting a row that already holds values.
  // **By id, because the picker keeps demos out of Your cases on purpose.**
  const api = await asAdminApi(baseURL ?? '')
  const cases = (await (await api.get('/api/cases')).json()) as
    { id: string; title: string; isDemo?: boolean }[]
  const demo = cases.find((one) => one.isDemo)
  expect(demo, 'no demo case is installed - the dialogs need real content').toBeTruthy()
  await page.goto(`/cases/${demo!.id}/timeline`)
  await settle(page)

  for (const ground of GROUNDS) {
    await setGround(page, ground)

    // **The timeline itself, before any dialog.** The rail is painted from the
    // entry's colour and the sweep cannot reach it: `sweep.spec.ts` walks an
    // empty fixture case, where every section draws its empty state.
    await section(page, 'timeline')
    await quiesce(page)
    await shoot(page, join(OUT, `${ground}-timeline-rails.png`))

    for (const door of DOORS) {
      await section(page, door.slug)
      await quiesce(page)
      if (door.button !== undefined) {
        const add = page.getByRole('button', { name: door.button }).first()
        await add.waitFor({ state: 'visible', timeout: 15_000 })
        await add.click()

        const dialog = page.getByRole('dialog')
        await dialog.waitFor({ state: 'visible', timeout: 15_000 })
        await quiesce(page)
        await dialog.screenshot({ path: join(OUT, `${ground}-${door.name}.png`) })

        // **Do the controls fill their column?** `dialog-12`'s every control
        // does; measured here because a select that shrinks to an em dash
        // looks deliberate in a screenshot and is not.
        if (process.env['MEASURE'] === '1') {
          const widths = await dialog.evaluate((root) => {
            const out: Record<string, unknown>[] = []
            for (const el of root.querySelectorAll('input, textarea, [data-slot="select-trigger"], button[role="combobox"]')) {
              const box = el.getBoundingClientRect()
              if (box.width === 0) continue
              const cell = el.closest('[data-slot="field"], section, div')
              const cellBox = cell?.getBoundingClientRect()
              out.push({
                tag: el.tagName.toLowerCase(),
                role: el.getAttribute('role') ?? '',
                w: Math.round(box.width),
                cell: cellBox ? Math.round(cellBox.width) : null,
                fills: cellBox ? box.width / cellBox.width > 0.9 : null,
              })
            }
            return out
          })
          process.stdout.write(`WIDTHS ${door.name} ${JSON.stringify(widths)}\n`)
          const cols = await dialog.evaluate((root) => {
            const out: Record<string, unknown>[] = []
            for (const el of root.querySelectorAll('section, [data-slot="dialog-column"]')) {
              const node = el as HTMLElement
              const label = node.getAttribute('aria-label') ?? ''
              if (!label) continue
              out.push({
                label,
                clientH: node.clientHeight,
                scrollH: node.scrollHeight,
                hidden: node.scrollHeight - node.clientHeight,
                fields: node.querySelectorAll('[data-slot="field"], label').length,
              })
            }
            return out
          })
          process.stdout.write(`COLS ${door.name} ${JSON.stringify(cols)}\n`)
        }

      // **The column heights, not the dialog's.** A dialog that fits says
      // nothing about a column that overflows while its neighbours are empty,
      // which is what grouping by control kind produces.
        if (ground === 'light') {
        const columns = await dialog.evaluate((el) =>
          [...el.querySelectorAll('section[aria-label]')].map((c) => ({
            title: c.getAttribute('aria-label') ?? '',
            height: Math.round(c.getBoundingClientRect().height),
            controls: c.querySelectorAll('input,select,textarea,[role="combobox"]').length,
          })),
        )
        console.log(`COLUMNS ${door.name} ${JSON.stringify(columns)}`)

        // **Whether the body overruns its own scroller**, which is what cuts
        // the last control in half. The section heights above sum to the
        // content and say nothing about the box holding it.
        const fit = await dialog.evaluate((el) => {
          const scroller = [...el.querySelectorAll('*')].find(
            (node) => node.scrollHeight > node.clientHeight + 1 && node.clientHeight > 200,
          )
          if (scroller === undefined) return null
          // **Padding counts in `scrollHeight` and not in the content.** The
          // bodies carry `p-1` to keep a focus ring off the clip edge, so a
          // dialog that fits perfectly reported 8px of overflow at each end
          // and read as a real finding.
          const pad = getComputedStyle(scroller)
          const inset =
            Number.parseFloat(pad.paddingTop) + Number.parseFloat(pad.paddingBottom)
          // **A residual 16px is known and is not clipping.** The three entity
          // dialogs report it identically whatever their content height, which
          // is the signature of an artefact rather than a defect, and the
          // captures show nothing cut. Subtracting the bodies' `-m-1` overhang
          // did not account for it, so the cause is not written down here -
          // read the number as "more than 16 means look".
          const over = scroller.scrollHeight - inset - scroller.clientHeight
          return over > 1
            ? { visible: scroller.clientHeight, content: scroller.scrollHeight, over }
            : null
        })
        console.log(`FIT ${door.name} ${JSON.stringify(fit)}`)
        }

        await page.keyboard.press('Escape')
        await expect(dialog).toBeHidden({ timeout: 10_000 })
      }

      // **The edit dialog is the one the analyst actually uses.** Creating is
      // one or two findings; correcting a row is what this surface is for, and
      // it is the only one that takes a claim. An empty create dialog says
      // nothing about it.
      const pencil = page.getByRole('button', { name: /^Edit / }).first()
      if ((await pencil.count()) > 0) {
        await pencil.click()
        const editing = page.getByRole('dialog')
        await editing.waitFor({ state: 'visible', timeout: 15_000 })
        await quiesce(page)
        await editing.screenshot({ path: join(OUT, `${ground}-${door.name}-edit.png`) })

        // **The fold, opened.** A collapsed band captures identically whether
        // its control renders or throws, so the closed shot certifies nothing
        // about the half that is behind a press.
        // **Scoped to the band.** `[aria-expanded=false]` alone also matches a
        // combobox trigger, and clicking one opens a popup that eats the
        // Escape meant for the dialog -- which fails as the dialog refusing to
        // close, two doors later.
        const folded = editing.locator(
          'section[aria-label="Links and containment"] button[aria-expanded="false"]',
        )
        if ((await folded.count()) > 0) {
          await folded.first().click()
          await quiesce(page)
          await editing.screenshot({ path: join(OUT, `${ground}-${door.name}-open.png`) })
        }

        // **The calendar, which no unit tier can lay out.** jsdom gives the
        // month grid a zero box, so its own tests assert selection and say
        // nothing about whether seven columns fit the popover.
        const calendar = editing.getByRole('button', { name: /^Pick .* from a calendar$/ })
        if ((await calendar.count()) > 0) {
          await calendar.first().click()
          await quiesce(page)
          // The whole viewport: the popover is portalled out of the dialog,
          // so shooting the dialog element cuts the calendar off entirely.
          await page.screenshot({ path: join(OUT, `${ground}-${door.name}-calendar.png`) })
          await page.keyboard.press('Escape')
        }

        // **A reference field with chips in it, which nothing else captures.**
        // Every demo entry arrives with its link fields empty, so both the
        // sweep and every shot above draw the same blank box - and the chips
        // are the whole of what the multiselect changed. Two picks, because
        // one chip says nothing about how a row of them wraps.
        //
        // **Found by `data-slot`, not by a field name.** A scalar reference
        // picker looks identical at rest and closes its list on the first
        // pick, so the second Enter reaches the dialog and submits it - which
        // fails two lines down as a dialog that will not screenshot.
        const chips = editing.locator('[data-slot="combobox-chips"]').first()
        if ((await chips.count()) > 0) {
          await chips.click()
          // **Picked from the keyboard, not by clicking.** The box grows by a
          // chip on each pick, which moves the popup anchored to it and
          // rebuilds the rows underneath - Playwright then refuses the next
          // click, first as "element is not stable" and then as "element was
          // detached from the DOM". Arrow-and-Enter needs neither a stable box
          // nor a surviving node, and it is the gesture a keyboard analyst
          // uses anyway.
          for (const _ of [0, 1]) {
            await page.keyboard.press('ArrowDown')
            await page.keyboard.press('Enter')
            await quiesce(page)
          }
          // Only if the list is still open: Enter on the last row closes it,
          // and an unconditional Escape then closes the dialog instead.
          if (await page.getByRole('listbox').first().isVisible()) {
            await page.keyboard.press('Escape')
            await quiesce(page)
          }
          // **The pointer off the chip, before the shot and before Escape.**
          // A chip is an `EntityLink`, so the pointer left resting on it opens
          // its hover card - which lands in the capture as a panel over the
          // column, and eats the Escape meant for the dialog, so the dialog
          // then fails to close two doors later.
          await page.mouse.move(4, 4)
          // The card closes on a delay, so moving the pointer is not enough on
          // its own - `quiesce` returns while it is still fading and the
          // capture holds a half-transparent panel over the column.
          await page
            .locator('[data-slot="hover-card-content"]')
            .first()
            .waitFor({ state: 'detached', timeout: 5000 })
            .catch(() => undefined)
          await quiesce(page)
          await editing.screenshot({ path: join(OUT, `${ground}-${door.name}-chips.png`) })
        }

        // **`closeDialog`, not a bare Escape.** A combobox that has been typed
        // in eats the first Escape - clearing its own input is what that key
        // means inside a picker, and the dialog behind it is meant to survive
        // it. The helper presses, checks, and falls back to Cancel.
        expect(await closeDialog(page), 'the edit dialog would not close').not.toBe('stuck')
        await expect(editing).toBeHidden({ timeout: 10_000 })
      }
    }
  }
  // The capture is the deliverable; a run that shot nothing is the failure.
  await shoot(page, join(OUT, 'last-section.png'))
})
