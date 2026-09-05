/**
 * The vertical budget a written section actually has on the report screen.
 *
 * A design drawn against a standalone prototype gets the proportions wrong:
 * the real screen carries a rail, a case header, the report's own toolbar and a
 * section list before any prose. This measures what is left, so a mockup can be
 * drawn at true proportion rather than at whatever fits the page.
 */
import { expect, test } from '@playwright/test'

import { ADMIN, settle, signIn } from './support/app.js'

test('measure the report screen', async ({ page, request }) => {
  const signedIn = await request.post('/api/auth/sign-in/email', {
    data: { email: ADMIN.email, password: ADMIN.password },
  })
  expect(signedIn.ok()).toBe(true)
  const rows = (await (await request.get('/api/cases')).json()) as
    { id: string; reference?: string | null }[]
  const caseId = rows.find((row) => row.reference === 'DEMO-2026-031')!.id

  await signIn(page)
  await page.goto(`/cases/${caseId}/report`, { waitUntil: 'domcontentloaded' })
  await settle(page)
  await page.getByText(/Customer RCA/i).first().click()
  await settle(page)

  const seen = await page.evaluate(() => {
    const box = (selector: string) => {
      const node = document.querySelector(selector)
      if (!node) return null
      const rect = node.getBoundingClientRect()
      return {
        x: Math.round(rect.x), y: Math.round(rect.y),
        w: Math.round(rect.width), h: Math.round(rect.height),
      }
    }
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      rail: box('nav') ?? box('[data-testid="rail"]'),
      main: box('main'),
      // The section list beside the prose, and the first written section.
      sections: [...document.querySelectorAll('main *')]
        .filter((n) => /^\d\d$/.test((n.textContent ?? '').trim()))
        .slice(0, 1)
        .map((n) => n.getBoundingClientRect().height),
      paragraphs: [...document.querySelectorAll('main p')].length,
      // The two columns inside the editor: the section list and the prose.
      columns: [...document.querySelectorAll('main div')]
        .map((n) => n.getBoundingClientRect())
        .filter((r) => r.height > 300 && r.width > 120 && r.width < 1100)
        .slice(0, 4)
        .map((r) => ({ x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height) })),
    }
  })
  console.log(JSON.stringify(seen, null, 1))
})
