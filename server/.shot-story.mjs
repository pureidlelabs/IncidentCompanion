import { chromium } from 'playwright'

const [, , storyId, out, theme = 'light', width = '1200', height = '900'] = process.argv

const browser = await chromium.launch()
// **Reduced motion, or the shot lands mid-animation.** The settle loop below
// samples `innerHTML.length` and the body's height, and a transform moves
// neither -- so a travelling `layoutId` ground photographs in flight, under a
// label that has already taken its selected colour. That reads exactly like a
// contrast defect and is not one. The app honours the preference through
// `MotionConfig reducedMotion="user"`, so this is the settled state rather than
// a suppressed one. `SHOT_MOTION=1` to photograph the motion on purpose.
const page = await browser.newPage({
  viewport: { width: Number(width), height: Number(height) },
  colorScheme: theme === 'dark' ? 'dark' : 'light',
  reducedMotion: process.env['SHOT_MOTION'] === '1' ? 'no-preference' : 'reduce',
})

// **`STORYBOOK_URL`, as `storybook.spec.ts` already takes.** A worktree's
// Storybook is on its own port, and a hardcoded 6006 answers from whichever
// tree happens to be serving it: measured 2026-08-26, a shot of a toast story
// came back drawn from another worktree's build, and a capture of the wrong
// tree is pixel-identical to a capture of code that has not changed.
const SB = process.env['STORYBOOK_URL'] ?? 'http://localhost:6006'

await page.goto(`${SB}/iframe.html?id=${storyId}&viewMode=story`, {
  waitUntil: 'networkidle',
})
await page.evaluate((t) => {
  document.documentElement.setAttribute('data-theme', t)
}, theme)

// Two agreeing samples rather than a fixed wait.
let last = ''
for (let i = 0; i < 25; i++) {
  const now = await page.evaluate(
    () => `${String(document.body.innerHTML.length)}:${String(Math.round(document.body.getBoundingClientRect().height))}`,
  )
  if (now === last) break
  last = now
  await page.waitForTimeout(200)
}

await page.screenshot({ path: out })

// Every scroller in the page, with whether it is actually holding content back.
const scrollers = await page.evaluate(() => {
  const out = []
  for (const el of document.querySelectorAll('*')) {
    const style = getComputedStyle(el)
    if (style.overflowY !== 'auto' && style.overflowY !== 'scroll') continue
    const node = el
    out.push({
      tag: node.tagName.toLowerCase(),
      cls: String(node.className).slice(0, 48),
      clientH: node.clientHeight,
      scrollH: node.scrollHeight,
      hidden: node.scrollHeight - node.clientHeight,
    })
  }
  return out
})
console.log(JSON.stringify(scrollers, null, 1))

await browser.close()
