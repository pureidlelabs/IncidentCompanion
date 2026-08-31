import { chromium } from 'playwright'

const [, , storyId, selector] = process.argv
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
await page.goto(`http://localhost:6006/iframe.html?id=${storyId}&viewMode=story`, {
  waitUntil: 'networkidle',
})
await page.waitForTimeout(600)

const seen = await page.evaluate((sel) => {
  const el = document.querySelector(sel)
  if (!el) return { found: false }
  const s = getComputedStyle(el)
  const r = el.getBoundingClientRect()
  return {
    found: true,
    backgroundImage: s.backgroundImage.slice(0, 260),
    backgroundAttachment: s.backgroundAttachment,
    backgroundSize: s.backgroundSize,
    borderTop: s.borderTopWidth + ' ' + s.borderTopColor,
    borderBottom: s.borderBottomWidth + ' ' + s.borderBottomColor,
    top: Math.round(r.top),
    bottom: Math.round(r.bottom),
  }
}, selector)

console.log(JSON.stringify(seen, null, 1))
await browser.close()
