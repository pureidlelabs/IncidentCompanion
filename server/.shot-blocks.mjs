import { chromium } from 'playwright'

const names = process.argv.slice(2)
const browser = await chromium.launch()

for (const name of names) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  try {
    await page.goto(`https://reui.io/preview/base/${name}?embed=1`, {
      waitUntil: 'networkidle',
      timeout: 45_000,
    })
    // Two agreeing samples rather than a fixed wait.
    let last = ''
    for (let i = 0; i < 25; i++) {
      const now = await page.evaluate(() => String(document.body.innerHTML.length))
      if (now === last) break
      last = now
      await page.waitForTimeout(250)
    }
    await page.screenshot({ path: `/home/vscode/.claude/jobs/e965697f/tmp/${name}.png` })
    console.log(`${name}: ok`)
  } catch (error) {
    console.log(`${name}: FAILED ${String(error).slice(0, 90)}`)
  }
  await page.close()
}

await browser.close()
