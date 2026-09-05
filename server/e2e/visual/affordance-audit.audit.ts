/**
 * Drive both rebuild tiers' matched stories and report what only the app tier
 * offers.
 *
 * ## What it can and cannot see
 */
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { expect, test, type Locator, type Page } from '@playwright/test'

import { STORYBOOK_URL } from './storybook-url.js'

import {
  affordanceKey,
  componentsOf,
  capabilitiesOf,
  familyOf,
  parseSnapshot,
  siblingGaps,
  unreachableWithinStories,
  type Affordance,
  type StoryAffordances,
  type SnapshotNode,
  type StoryEntry,
} from './affordance-audit.js'

const SB = STORYBOOK_URL
const STORY_CAP = Number(process.env['AFFORDANCE_STORY_CAP'] ?? '8')
const ONLY = process.env['AFFORDANCE_ONLY'] ?? ''
/**
 * **Not `test-results/`, which Playwright owns.**
 */
const OUT = join(process.cwd(), '.affordance-audit')

/**
 * The containers a pointer is walked over, because actions hide behind one -
 * in order, and the first group that matches anything wins.
 */
const ROW_SELECTORS = [
  '[data-row-id]',
  '[role="row"]:not(:has([role="columnheader"]))',
  '[data-slot="timeline-row"]',
  '[data-slot="entity-card"]',
  '[role="article"]',
  'tbody tr',
  ':is([role="listitem"], li):not(:is(nav, [role="navigation"], [role="menu"], [role="listbox"]) *)',
]

interface StoryReading {
  readonly storyId: string
  readonly affordances: Affordance[]
  readonly error?: string
}

/** `role|name` counted, so ten rows of `Edit` are ten and not one. */
function tally(list: readonly { role: string; name: string }[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const one of list) {
    const key = `${one.role} ${one.name}`
    out.set(key, (out.get(key) ?? 0) + 1)
  }
  return out
}

/**
 * Force every effectively transparent element out of sight, and say what was
 * hidden.
 */
function hideTransparent(): { label: string; why: string }[] {
  const reasons: { label: string; why: string }[] = []
  for (const el of document.querySelectorAll('body *')) {
    if (!(el instanceof HTMLElement)) continue
    const style = getComputedStyle(el)
    // **Opacity only, and `inert` is deliberately not a reason.** A modal
    // marks the page behind it inert, and that page is unreachable because
    // something is open in front of it - which is the control working, not a
    // defect. Counting it put the whole of five screens into the report on the
    // stories that render an overlay open, and `exclude.ts` next door records
    // the same lesson for the geometry sweep.
    if (Number(style.opacity) >= 0.05) continue
    const why = `opacity ${style.opacity}`
    el.setAttribute('data-afa-hidden', '')
    el.style.setProperty('visibility', 'hidden', 'important')
    const label = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 120)
    reasons.push({ label, why })
  }
  return reasons
}

function showAgain(): void {
  for (const el of document.querySelectorAll('[data-afa-hidden]')) {
    if (!(el instanceof HTMLElement)) continue
    el.style.removeProperty('visibility')
    el.removeAttribute('data-afa-hidden')
  }
}

/**
 * What the story offers right now, split into reached and blocked.
 */
async function readScope(page: Page, scope: Locator, via: string): Promise<Affordance[]> {
  let full: SnapshotNode[] = []
  try {
    full = parseSnapshot(await scope.ariaSnapshot({ timeout: 5_000 }))
  } catch {
    return []
  }
  const reasons = await page.evaluate(hideTransparent)
  const reached = await scope
    .ariaSnapshot({ timeout: 5_000 })
    .then(parseSnapshot)
    // A snapshot that could not be taken must not read as everything having
    // vanished, which would report the whole story as unreachable.
    .catch(() => full)
  await page.evaluate(showAgain)

  const left = tally(reached)
  const out: Affordance[] = []
  for (const one of full) {
    const key = `${one.role} ${one.name}`
    const held = left.get(key) ?? 0
    const where = { container: one.container, ordinal: one.ordinal }
    if (held > 0) {
      left.set(key, held - 1)
      out.push({ role: one.role, name: one.name, via, ...where })
      continue
    }
    const reason = reasons.find(
      (it) => it.label === one.name || (one.name !== '' && it.label.includes(one.name)),
    )
    out.push({
      role: one.role,
      name: one.name,
      via,
      ...where,
      blocked: reason?.why ?? 'not revealed',
    })
  }
  return out
}

/**
 * Whether a person could actually press this, as opposed to Playwright.
 */
async function canBePressed(one: Locator): Promise<boolean> {
  return one
    .evaluate((node) => {
      for (let at: Element | null = node; at; at = at.parentElement) {
        const style = getComputedStyle(at)
        if (Number(style.opacity) < 0.05) return false
        if (style.visibility === 'hidden' || style.display === 'none') return false
      }
      return !node.closest('[inert]')
    }, {})
    .catch(() => false)
}

/** Every open menu, listbox or dialog, whose contents are all reachable. */
async function readOverlays(page: Page, via: string): Promise<Affordance[]> {
  const out: Affordance[] = []
  for (const role of ['menu', 'listbox', 'dialog']) {
    const found = await page.getByRole(role as 'menu').all()
    for (const one of found.slice(0, 3)) {
      try {
        for (const it of parseSnapshot(await one.ariaSnapshot({ timeout: 3_000 }))) {
          out.push({ ...it, via })
        }
      } catch {
        /* an overlay that closed under us is not a reading */
      }
    }
  }
  return out
}

async function dismiss(page: Page): Promise<void> {
  await page.keyboard.press('Escape').catch(() => undefined)
  await page.waitForTimeout(120)
}

/**
 * Quiet, and quiet for long enough to mean it.
 */
async function settle(page: Page): Promise<void> {
  // **Deprecated, and this probe still wants it** - the same trade `view.ts`
  // states: a test should wait on the thing it is about, and an audit of a
  // whole story is about the whole page having stopped.
  // eslint-disable-next-line playwright/no-networkidle
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined)
  // A boundary still saying it is busy is a skeleton, and a skeleton holds
  // perfectly still for the sampler below.
  await page
    .locator('#storybook-root [aria-busy="true"]')
    .first()
    .waitFor({ state: 'detached', timeout: 8_000 })
    .catch(() => undefined)
  let last = ''
  let agreed = 0
  for (let at = 0; at < 40; at += 1) {
    const now = await page
      .evaluate(
        () =>
          `${String(document.body.innerHTML.length)}:${String(Math.round(document.body.getBoundingClientRect().height))}`,
      )
      .catch(() => 'x')
    if (now === last) {
      agreed += 1
      if (agreed >= 3) return
    } else {
      agreed = 0
    }
    last = now
    await page.waitForTimeout(150)
  }
}

/** Walk one story through every pass and return what it offered. */
async function readStory(page: Page, storyId: string): Promise<StoryReading> {
  const affordances: Affordance[] = []
  try {
    await page.goto(`${SB}/iframe.html?id=${storyId}&viewMode=story`, {
      waitUntil: 'load',
      timeout: 25_000,
    })
    await page.locator('#storybook-root').waitFor({ state: 'attached', timeout: 10_000 })
    await settle(page)
  } catch (cause) {
    return { storyId, affordances, error: `load: ${String(cause)}` }
  }

  const root = page.locator('#storybook-root')
  affordances.push(...(await readScope(page, root, 'rest')))
  affordances.push(...(await readOverlays(page, 'rest')))

  let rows: Locator[] = []
  for (const selector of ROW_SELECTORS) {
    const found = await page
      .locator(`#storybook-root ${selector}`)
      .all()
      .catch(() => [])
    if (found.length > 0) {
      rows = found
      break
    }
  }
  // Three rows: enough to see a cluster reveal and a second row stay dark,
  // and the pass is the run's cost centre.
  for (const row of rows.slice(0, 3)) {
    try {
      if (!(await row.isVisible({ timeout: 1_000 }))) continue
      await row.hover({ timeout: 2_000 })
      await page.waitForTimeout(150)
    } catch {
      continue
    }
    affordances.push(...(await readScope(page, root, 'hover')))

    const triggers = await row
      .locator('[aria-haspopup="menu"], [aria-haspopup="true"]')
      .all()
      .catch(() => [])
    for (const trigger of triggers.slice(0, 2)) {
      // A trigger nobody can reach carries nothing, whatever it would open.
      if (!(await canBePressed(trigger))) continue
      try {
        await trigger.click({ timeout: 2_000 })
        await page.waitForTimeout(200)
        affordances.push(...(await readOverlays(page, 'menu')))
      } catch {
        /* a trigger nothing could reach is the finding, not an error */
      }
      await dismiss(page)
    }

    try {
      await row.click({ button: 'right', timeout: 2_000 })
      await page.waitForTimeout(200)
      affordances.push(...(await readOverlays(page, 'contextmenu')))
    } catch {
      /* no context menu here */
    }
    await dismiss(page)
  }

  const pageTriggers = await page
    .locator('#storybook-root [aria-haspopup="menu"], #storybook-root [aria-haspopup="true"]')
    .all()
    .catch(() => [])
  for (const trigger of pageTriggers.slice(0, 4)) {
    try {
      if (!(await trigger.isVisible({ timeout: 500 }))) continue
      if (!(await canBePressed(trigger))) continue
      await trigger.click({ timeout: 2_000 })
      await page.waitForTimeout(200)
      affordances.push(...(await readOverlays(page, 'menu')))
    } catch {
      /* nothing opened */
    }
    await dismiss(page)
  }

  return { storyId, affordances }
}

/** The distinct capabilities a tier actually reached, sorted. */
function keysReached(list: readonly Affordance[]): string[] {
  return [
    ...new Set(list.filter((one) => !one.blocked).map((one) => affordanceKey(one.role, one.name))),
  ].sort()
}

interface ComponentResult {
  readonly slug: string
  readonly surface: string
  readonly family: string
  readonly title: string
  readonly stories: string[]
  readonly errors: string[]
  /** Every capability it reached, so a later question needs no re-run. */
  readonly keys: string[]
  /** Controls in the DOM that nothing in their own story reveals. */
  readonly dark: ReturnType<typeof unreachableWithinStories>
  /**
   * Every distinct reading it gave, kept so the families can be re-decided
   * without driving a browser again.
   */
  readonly raw: Affordance[]
}

/** One reading per distinct role, name, pass, place and reason. */
function distinct(list: readonly Affordance[]): Affordance[] {
  const seen = new Map<string, Affordance>()
  for (const one of list) {
    const key = `${one.role}|${one.name}|${one.via}|${one.blocked ?? ''}|${one.container ?? ''}|${String(one.ordinal ?? -1)}`
    if (!seen.has(key)) seen.set(key, one)
  }
  return [...seen.values()]
}

async function readComponent(
  page: Page,
  stories: readonly StoryEntry[],
): Promise<{
  affordances: Affordance[]
  perStory: StoryAffordances[]
  ids: string[]
  errors: string[]
}> {
  const affordances: Affordance[] = []
  const perStory: StoryAffordances[] = []
  const ids: string[] = []
  const errors: string[] = []
  for (const story of stories.slice(0, STORY_CAP)) {
    const reading = await readStory(page, story.id)
    ids.push(story.id)
    if (reading.error) errors.push(`${story.id}: ${reading.error}`)
    affordances.push(...reading.affordances)
    perStory.push({ storyId: story.id, affordances: reading.affordances })
  }
  return { affordances, perStory, ids, errors }
}

/**
 * What one family of components disagrees about.
 */
function siblingSection(results: readonly ComponentResult[]): string[] {
  const gaps = siblingGaps(
    results.map((one) => ({
      family: one.family,
      member: one.slug,
      keys: capabilitiesOf(one.raw),
    })),
  )
  const say = (gap: (typeof gaps)[number]): string =>
    `- \`${gap.family}\` \`${gap.key}\` - only ${(gap.odd === 'have' ? gap.have : gap.lack).join(', ')} ` +
    `${gap.odd === 'have' ? 'has' : 'does not have'} it ` +
    `(${String(gap.have.length)} of ${String(gap.have.length + gap.lack.length)})`

  const lines: string[] = [
    `## Capabilities a family does not agree about - ${String(gaps.length)}`,
    '',
  ]
  // The two directions are not equally trustworthy and are not mixed. One
  // sibling short of the whole family is nearly always a defect; one sibling
  // ahead of it is as often that component's own vocabulary, and it is also
  // the shape the row-expansion defect had - so it is reported, below, rather
  // than filtered away.
  lines.push('One short of the family:', '')
  for (const gap of gaps.filter((one) => one.odd === 'lack')) lines.push(say(gap))
  lines.push('', 'One ahead of it - read these before acting:', '')
  for (const gap of gaps.filter((one) => one.odd === 'have')) lines.push(say(gap))
  lines.push('')
  return lines
}

function markdown(results: readonly ComponentResult[]): string {
  const lines: string[] = []
  const dark = results.filter((one) => one.dark.length > 0)
  const families = new Set(results.map((one) => one.family).filter((one) => one !== ''))

  lines.push('# Affordance audit', '')
  lines.push(`Components driven: ${String(results.length)}.`)
  lines.push(`Families: ${String(families.size)}.`)
  lines.push(
    `Controls painted at zero in their own story: ` +
      `${String(dark.reduce((sum, one) => sum + one.dark.length, 0))}, ` +
      `across ${String(dark.length)} components.`,
    '',
  )

  lines.push(...siblingSection(results))

  lines.push('## Controls painted at zero in their own story', '')
  for (const one of dark) {
    lines.push(`### ${one.slug} (${one.surface})`, '')
    lines.push(`- \`${one.title}\` - ${one.stories.join(', ')}`)
    for (const at of one.dark) {
      lines.push(
        `- **painted at zero** \`${at.key}\` in \`${at.storyId}\` (${at.why}) - ` +
          `${at.names.map((it) => `"${it}"`).join(', ')}`,
      )
    }
    lines.push('')
  }

  // Named rather than dropped: a component in no family is one nothing here
  // can make a claim about, and a report that simply omits it reads as a
  // component that passed.
  lines.push('## Components in no family', '')
  lines.push('Nothing above can say anything about these - they name no shape.', '')
  for (const one of results.filter((it) => it.family === '')) {
    lines.push(`- \`${one.slug}\` (${one.surface}) - ${one.title}`)
  }
  lines.push('')

  const broken = results.filter((one) => one.errors.length > 0)
  if (broken.length > 0) {
    lines.push('## Stories that did not read', '')
    for (const one of broken) lines.push(`- \`${one.slug}\` - ${one.errors.join(' | ')}`)
    lines.push('')
  }
  return lines.join('\n')
}

test.describe('the probe can tell reachable from painted-at-zero', () => {
  /**
   * **The audit's headline claim, asserted rather than assumed.**
   */
  test('a zero-opacity control reads as blocked and its twin does not', async ({ page }) => {
    const answer = await fetch(`${SB}/index.json`, { signal: AbortSignal.timeout(10_000) }).catch(
      () => null,
    )
    test.skip(!answer?.ok, `no Storybook at ${SB} - run \`cd ui && npm run storybook\``)

    await page.goto(`${SB}/iframe.html?id=blocks-empty-state-empty-state--default&viewMode=story`, {
      waitUntil: 'load',
      timeout: 25_000,
    })
    const root = page.locator('#storybook-root')
    await root.waitFor({ state: 'attached', timeout: 10_000 })
    await page.evaluate(() => {
      const host = document.querySelector('#storybook-root')
      if (!host) throw new Error('no story root')
      const dark = document.createElement('button')
      dark.textContent = 'Painted at zero'
      dark.style.opacity = '0'
      const lit = document.createElement('button')
      lit.textContent = 'Plainly there'
      host.append(dark, lit)
    })

    const found = await readScope(page, root, 'rest')
    const dark = found.find((one) => one.name === 'Painted at zero')
    const lit = found.find((one) => one.name === 'Plainly there')

    expect(dark, 'the zero-opacity control was not enumerated at all').toBeDefined()
    expect(dark?.blocked).toBe('opacity 0')
    expect(lit, 'the visible control was not enumerated at all').toBeDefined()
    expect(lit?.blocked).toBeUndefined()

    // And the page is left as it was found, or every later reading is wrong.
    const stillHidden = page.locator('[data-afa-hidden]')
    await expect(stillHidden).toHaveCount(0)
  })

  test('a control is reported with the landmark it sits in and its place in it', async ({
    page,
  }) => {
    const answer = await fetch(`${SB}/index.json`, { signal: AbortSignal.timeout(10_000) }).catch(
      () => null,
    )
    test.skip(!answer?.ok, `no Storybook at ${SB} - run \`cd ui && npm run storybook\``)

    await page.goto(`${SB}/iframe.html?id=blocks-empty-state-empty-state--default&viewMode=story`, {
      waitUntil: 'load',
      timeout: 25_000,
    })
    const root = page.locator('#storybook-root')
    await root.waitFor({ state: 'attached', timeout: 10_000 })
    await page.evaluate(() => {
      const host = document.querySelector('#storybook-root')
      if (!host) throw new Error('no story root')
      const bar = document.createElement('div')
      bar.setAttribute('role', 'toolbar')
      bar.setAttribute('aria-label', 'Planted bar')
      for (const label of ['First planted', 'Second planted']) {
        const wrap = document.createElement('div')
        const one = document.createElement('button')
        one.textContent = label
        // Wrapped, because a real control is never a direct child of its
        // toolbar and pairing on the wrapper would put both at ordinal 0.
        wrap.append(one)
        bar.append(wrap)
      }
      host.append(bar)
    })

    const found = await readScope(page, root, 'rest')
    expect(found.find((one) => one.name === 'First planted')).toMatchObject({
      container: 'toolbar:planted bar',
      ordinal: 0,
    })
    expect(found.find((one) => one.name === 'Second planted')?.ordinal).toBe(1)
  })
})

test.describe('what a family of components does not agree about', () => {
  test('every family agrees with itself', async ({ page }) => {
    test.setTimeout(120 * 60_000)
    const answer = await fetch(`${SB}/index.json`, { signal: AbortSignal.timeout(10_000) })
    test.skip(!answer.ok, `no Storybook at ${SB} - run \`cd ui && npm run storybook\``)
    const index = (await answer.json()) as { entries: Record<string, StoryEntry> }

    const only = ONLY.split(',')
      .map((one) => one.trim())
      .filter((one) => one.length > 0)
    const wanted = componentsOf(Object.values(index.entries)).filter(
      (one) => only.length === 0 || only.some((it) => one.slug.includes(it)),
    )

    console.log(`[affordance-audit] ${String(wanted.length)} components`)

    const results: ComponentResult[] = []
    for (const one of wanted) {
      const read = await readComponent(page, one.stories)
      const dark = unreachableWithinStories(read.perStory)
      results.push({
        slug: one.slug,
        surface: one.surface,
        family: familyOf(one.surface, one.slug),
        title: one.title,
        stories: read.ids,
        errors: read.errors,
        keys: keysReached(read.affordances),
        dark,
        raw: distinct(read.affordances),
      })
      console.log(
        `[affordance-audit] ${one.slug}: ${String(read.ids.length)} stories, ` +
          `${String(dark.length)} painted at zero`,
      )
    }

    await mkdir(OUT, { recursive: true })
    // The run before this one, kept: what the audit is read for is the
    // difference against the last one, and a fresh run is the only thing that
    // ever destroys the evidence for it.
    for (const name of ['report.md', 'report.json']) {
      await rename(join(OUT, name), join(OUT, name.replace('report.', 'report.prev.'))).catch(
        () => undefined,
      )
    }
    await writeFile(join(OUT, 'report.json'), JSON.stringify({ components: results }, null, 1))
    await writeFile(join(OUT, 'report.md'), markdown(results))

    console.log(`[affordance-audit] written to ${OUT}`)
  })
})
