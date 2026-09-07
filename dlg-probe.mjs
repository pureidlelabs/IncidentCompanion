/** Does an open kit dialog carry data-open, which DIALOG requires? Scratch. */
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://127.0.0.1:5973'
const DIALOG = '[role="dialog"][data-open], [role="alertdialog"][data-open]'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
await page.getByLabel(/e-?mail|username/i).first().fill('analyst@example.test')
await page.getByLabel(/password/i).first().fill('incidentcompanion-dev')
await page.getByRole('button', { name: /sign in/i }).click()
await page.getByRole('heading', { name: /cases/i }).first().waitFor({ state: 'visible' })

await page.locator('[data-testid="picker-row-demos"]').first().click()
await page.waitForTimeout(1200)
await page.locator('main a').first().click().catch(() => undefined)
await page.waitForTimeout(2000)
await page.locator('[data-testid="rail"] nav a[href$="/timeline"]').first().click()
await page.waitForTimeout(2200)

await page.locator('main').getByRole('button', { name: /^(Add|New) / }).first().click()
await page.waitForTimeout(1500)

console.log(JSON.stringify(await page.evaluate((sel) => {
  const all = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')]
  return {
    dialogsOnPage: all.length,
    matchedByDIALOG: document.querySelectorAll(sel).length,
    attributes: all.map((n) =>
      [...n.attributes].map((a) => `${a.name}${a.value ? '=' + a.value.slice(0, 26) : ''}`).join(' ').slice(0, 240),
    ),
  }
}, DIALOG), null, 1))

console.log('\nescape closes it?')
await page.keyboard.press('Escape')
await page.waitForTimeout(1200)
console.log('  dialogs left:', await page.locator('[role="dialog"], [role="alertdialog"]').count())
await browser.close()
