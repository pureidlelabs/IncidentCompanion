/**
 * **A case screen whose connection is down says so.**
 *
 * The real client against the real server, with the case socket passed through
 * the browser's own routing so the test can drop it and hold it down. While it
 * is down another analyst writes, which this screen cannot hear about; the line
 * is what tells the analyst the screen may be behind.
 */
import { expect, test, type Page, type WebSocketRoute } from '@playwright/test'

import {
  ADMIN,
  asAdminApi,
  asPersona,
  ensureCase,
  fixtureCaseId,
  requireServedApp,
  settle,
} from './support/app.js'

test.beforeAll(async ({ browser, baseURL }) => {
  await ensureCase(browser, baseURL ?? '')
})

test.beforeEach(async ({ baseURL }) => {
  await requireServedApp(baseURL ?? '')
})

/** The case socket, passed through until `down` is set, and refused while it is. */
async function socketSwitch(page: Page) {
  const state = { down: false, open: [] as WebSocketRoute[] }
  await page.routeWebSocket(/\/live$/, (socket) => {
    if (state.down) {
      void socket.close({ code: 1011, reason: 'held down by the test' })
      return
    }
    socket.connectToServer()
    state.open.push(socket)
  })
  return {
    drop: async () => {
      state.down = true
      await Promise.all(
        state.open
          .splice(0)
          .map((socket) => socket.close({ code: 1011, reason: 'dropped by the test' })),
      )
    },
    restore: () => {
      state.down = false
    },
  }
}

async function customer(baseURL: string, caseId: string, value: string): Promise<void> {
  const api = await asAdminApi(baseURL)
  try {
    const now = (await (await api.get(`/api/cases/${caseId}`)).json()) as { version: number }
    const answer = await api.patch(`/api/cases/${caseId}`, {
      data: { customer: value, version: now.version },
    })
    expect(answer.status()).toBe(200)
  } finally {
    await api.dispose()
  }
}

test.describe('a case screen whose connection drops', () => {
  test.setTimeout(120_000)

  test('says it is not live until what changed has been read again', async ({
    browser,
    baseURL,
  }) => {
    const api = await asAdminApi(baseURL ?? '')
    const caseId = await fixtureCaseId(api)
    await api.dispose()
    const { context, page } = await asPersona(browser, ADMIN)
    try {
      const live = await socketSwitch(page)
      await page.goto(`/cases/${caseId}/overview`, { waitUntil: 'domcontentloaded' })
      await page.getByRole('tab', { name: 'Properties' }).click()
      await settle(page)
      const line = page.locator('[data-part="not-live"]')
      await expect(line, 'a screen with its connection up said it was not live').toHaveCount(0)

      await live.drop()
      await expect(line, 'the screen went on presenting itself as current').toBeVisible()

      const mark = `Written while this screen was deaf ${String(Date.now())}`
      await customer(baseURL ?? '', caseId, mark)
      await expect(line, 'the line cleared while the connection was still down').toBeVisible()

      live.restore()
      await expect(page.getByRole('textbox', { name: 'Customer', exact: true })).toHaveValue(mark, {
        timeout: 30_000,
      })
      await expect(line).toHaveCount(0)
    } finally {
      await context.close()
    }
  })

  test('offers to read the case again when the read after reconnecting fails', async ({
    browser,
    baseURL,
  }) => {
    const api = await asAdminApi(baseURL ?? '')
    const caseId = await fixtureCaseId(api)
    await api.dispose()
    const { context, page } = await asPersona(browser, ADMIN)
    try {
      const live = await socketSwitch(page)
      await page.goto(`/cases/${caseId}/overview`, { waitUntil: 'domcontentloaded' })
      await settle(page)
      const line = page.locator('[data-part="not-live"]')

      await live.drop()
      await expect(line).toBeVisible()
      await page.route(`**/api/cases/${caseId}`, (route) =>
        route.request().method() === 'GET'
          ? route.fulfill({ status: 503, body: '{}' })
          : route.continue(),
      )
      live.restore()
      const again = line.getByRole('button', { name: 'Read the case again' })
      await expect(again, 'a failed re-read left the screen looking current').toBeVisible({
        timeout: 45_000,
      })

      await page.unroute(`**/api/cases/${caseId}`)
      await again.click()
      await expect(line).toHaveCount(0, { timeout: 30_000 })
    } finally {
      await context.close()
    }
  })
})
