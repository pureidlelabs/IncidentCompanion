/**
 * The compliance constants against the Official Journal text they encode.
 *
 * **The direction is article to code.** A test that iterates the module's own
 * constants asks the module the question the module answers; what these catch
 * is a figure typed wrong and an article restructured under a threshold that
 * still cites it. Where an article states a number, the number has to be the
 * one the module carries.
 *
 * Ported from the Python tier's own DORA and NIS2 cases, which asserted that
 * tier's constants and had been collected by nothing since 2026-08-16 - while
 * four modules went on
 * claiming the figures were "checked against the vendored OJ text by the Python
 * suite". The values were right and the guarantee was gone, which is how a
 * comparison operator wrong in every NIS2 limb survived in the file that says
 * so.
 *
 * **Nothing re-fetches the text**, so a corrigendum leaves this green. That is
 * the deliberate trade: these hold the tree against the text as vendored.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  CLIENT_COUNT,
  CLIENT_SHARE,
  COSTS_EUR,
  DOWNTIME_MINUTES,
  DURATION_MINUTES,
  MEMBER_STATES,
  OTHER_THRESHOLDS_NEEDED,
} from './dora.js'
import {
  COMPLETE_OUTAGE_MINUTES,
  GENERAL_LOSS_EUR,
  GENERAL_LOSS_TURNOVER_SHARE,
  IR_ARTICLES,
  LIMITED_AVAILABILITY,
  USER_SHARE_ONLY,
} from './nis2-thresholds.js'

const DATA = join(dirname(fileURLToPath(import.meta.url)), '../../../tests/data')

const DORA = JSON.parse(readFileSync(join(DATA, 'dora-rts-2024-1772-articles.json'), 'utf8')) as {
  celex: string
  articles: Record<string, { text: string[] }>
}
const NIS2 = JSON.parse(
  readFileSync(join(DATA, 'nis2-ir-2024-2690-articles.json'), 'utf8'),
) as Record<string, string>

/** One article as a single line, so a limb split across paragraphs still matches. */
function flat(text: string): string {
  return text.replace(/\s+/g, ' ')
}

function doraArticle(number: number): string {
  const article = DORA.articles[String(number)]
  expect(article, `DORA article ${String(number)} is not in the vendored text`).toBeDefined()
  const text = flat(article!.text.join(' '))
  expect(text.trim(), `DORA article ${String(number)} parsed empty`).not.toBe('')
  return text
}

function nis2Article(citation: string): string {
  // `IR Art 9` -> `9`, which is how the fixture is keyed.
  const number = /(\d+)/.exec(citation)?.[1] ?? ''
  const text = NIS2[number]
  expect(text, `IR article ${number} is not in the vendored text`).toBeDefined()
  return flat(text!)
}

/**
 * **How the Official Journal spells a figure, which is not how a constant
 * stores one.** A thousands separator is a space, so `500000` is written
 * `500 000` and a bare `String(n)` finds nothing. A share is `5 %`, with the
 * space. And two figures are written as words rather than digits:
 *
 * - **60 minutes is "one hour"** - Articles 8, 9 and 10 all word the limited
 *   availability half that way, and none of them says "60 minutes".
 * - **1 000 000 is "1 million"** - Articles 9 to 13.
 *
 * Measured against the vendored text; a first version of this file asserted the
 * digits and failed on eight limbs whose constants were correct.
 */
const grouped = (n: number): string => n.toLocaleString('en-GB').replace(/,/g, ' ')
const percent = (share: number): string => `${String(Math.round(share * 100))} %`
const duration = (minutes: number): string =>
  minutes === 60 ? 'one hour' : `${String(minutes)} minutes`
const count = (n: number): string => (n === 1_000_000 ? '1 million' : grouped(n))

describe('DORA against Delegated Regulation (EU) 2024/1772', () => {
  it('is the instrument the module encodes', () => {
    expect(DORA.celex).toBe('32024R1772')
  })

  it('needs criticality and then one of two routes, and the second needs two', () => {
    const article8 = doraArticle(8)
    expect(article8).toContain('affected critical services')
    expect(article8).toContain('Article 9(5), point (b)')
    expect(article8).toContain('two or more of the other materiality thresholds')
    expect(OTHER_THRESHOLDS_NEEDED).toBe(2)
  })

  it('carries every figure Article 9 publishes, as Article 9 publishes it', () => {
    const article9 = doraArticle(9)
    expect(article9).toContain(`higher than ${percent(CLIENT_SHARE)}`)
    expect(article9).toContain(`higher than ${grouped(CLIENT_COUNT)}`)
    expect(article9).toContain(`longer than ${String(DURATION_MINUTES / 60)} hours`)
    expect(article9).toContain(`longer than ${String(DOWNTIME_MINUTES / 60)} hours`)
    expect(article9).toContain(grouped(COSTS_EUR))
    expect(MEMBER_STATES).toBe(2)
  })
})

describe('NIS2 against Implementing Regulation (EU) 2024/2690', () => {
  it('vendors every article the thresholds cite', () => {
    const missing = [...new Set(Object.values(IR_ARTICLES))].filter(
      (citation) => NIS2[/(\d+)/.exec(citation)?.[1] ?? ''] === undefined,
    )
    expect(missing, 'a threshold cites an article the fixture does not carry').toEqual([])
  })

  it("takes the general financial limb from Article 3's own figures", () => {
    const article3 = nis2Article('IR Art 3')
    expect(article3).toContain(`EUR ${grouped(GENERAL_LOSS_EUR)}`)
    expect(article3).toContain(percent(GENERAL_LOSS_TURNOVER_SHARE))
  })

  it.each(Object.entries(COMPLETE_OUTAGE_MINUTES))(
    'states %s complete unavailability in its own article',
    (kind, minutes) => {
      const article = nis2Article(IR_ARTICLES[kind]!)
      expect(article).toContain('completely unavailable')
      // `0` is "any complete outage counts", which the article states without a
      // duration - so there is no number to look for, only the limb.
      if (minutes > 0) expect(article).toContain(duration(minutes))
    },
  )

  it.each(Object.entries(LIMITED_AVAILABILITY))(
    'states each half of %s limited availability as the article has it',
    (kind, [minutes, share, absolute]) => {
      const article = nis2Article(IR_ARTICLES[kind]!)
      if (minutes !== null) expect(article).toContain(duration(minutes))
      if (share !== null) expect(article).toContain(percent(share))
      if (absolute !== null) expect(article).toContain(count(absolute))
    },
  )

  it.each(Object.entries(USER_SHARE_ONLY))(
    'reaches %s only by user share, and its article states both figures',
    (kind, [share, absolute]) => {
      const article = nis2Article(IR_ARTICLES[kind]!)
      expect(article).toContain(percent(share))
      expect(article).toContain(count(absolute))
      expect(LIMITED_AVAILABILITY[kind], `${kind} has a limited-availability limb`).toBeUndefined()
    },
  )
})

/**
 * **The wording that decides the comparison, which no figure check can see.**
 *
 * Every significance threshold in the Implementing Regulation is strictly
 * greater - "more than", "exceeds" - and `gates.threshold` compared `>=` for
 * months, in the file whose own docstring justified it as "correct for NIS2's
 * 'at least'". Exactly EUR 500 000, or exactly 30 minutes, reported an incident
 * the Regulation does not.
 *
 * So this asserts the text rather than the operator: the seven "at least"
 * clauses are the security-measures annex and Article 4's recurrence count, and
 * none of them is a limb the engine computes.
 */
describe('the comparison the Regulation words', () => {
  const wholeIR = Object.values(NIS2).map(flat).join(' ')

  it('never writes a significance threshold as "at least" or "equal to"', () => {
    expect(wholeIR).not.toContain('equal to or')
    // "at least" survives in the recurrence count (Art 4) and nowhere the
    // engine computes, so this pins where it may appear rather than that it
    // does not.
    const atLeast = [...wholeIR.matchAll(/.{60}at least.{60}/g)].map((m) => m[0])
    const outsideRecurrence = atLeast.filter((line) => !/twice within 6 months/.test(line))
    for (const line of outsideRecurrence) {
      expect(
        /annually|redundancy|one person|the following|policy|review/i.test(line),
        `an "at least" outside the security-measures annex: ${line}`,
      ).toBe(true)
    }
  })

  it('words the limbs this engine computes as strictly greater', () => {
    expect(nis2Article('IR Art 3')).toContain('exceeds')
    for (const kind of Object.keys(COMPLETE_OUTAGE_MINUTES)) {
      const article = nis2Article(IR_ARTICLES[kind]!)
      expect(article, `${kind}'s article does not say "more than"`).toContain('more than')
    }
  })
})
