/** `New note` opens a field with the caret already in it, in a real browser. -> #742 */
import { expect, test } from '@playwright/test'

import {
  ADMIN,
  asPersona,
  ensureCase,
  openFirstCase,
  requireServedApp,
  section,
} from './support/app.js'

test.beforeEach(async ({ browser, baseURL }) => {
  await requireServedApp(baseURL ?? '')
  await ensureCase(browser, baseURL ?? '')
})

const CONDITIONS = [
  { how: 'on an idle processor', rate: 1 },
  // Twenty, which is past the 6x that is the slowest preset DevTools offers,
  // so a caret surviving it survives any machine an analyst works on.
  { how: 'on a processor slowed twentyfold', rate: 20 },
]

for (const { how, rate } of CONDITIONS) {
  test(`New note opens a field the analyst can type into, ${how}`, async ({ browser }) => {
    const { context, page } = await asPersona(browser, ADMIN)
    try {
      await openFirstCase(page)
      await section(page, 'notes')
      // The throttle goes on after the navigation, which it would otherwise
      // slow by minutes while measuring nothing.
      if (rate > 1) {
        const cdp = await page.context().newCDPSession(page)
        await cdp.send('Emulation.setCPUThrottlingRate', { rate })
      }

      // A case holding no notes draws a second `New note` in its empty state,
      // and either of the two is the door.
      await page.getByRole('button', { name: 'New note' }).first().click()

      const body = page.getByRole('textbox', { name: 'Note', exact: true }).first()
      await expect(body, 'New note opened a field the caret is not in').toBeFocused()

      // Focus is not the claim. The caret is placed by a command the editor
      // runs after it reports ready, and a focused body it never reached takes
      // the keystroke nowhere while looking exactly the same.
      await page.keyboard.type('x')
      await expect(body, 'the caret was elsewhere and the keystroke was lost').toHaveText('x')
    } finally {
      await context.close()
    }
  })
}
