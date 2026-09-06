import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { glob } from 'glob'
import { describe, expect, it } from 'vitest'

import { ACTIVITY_ACTION } from '@contract/vocabularies.lists'

import { actionClassOf } from './action-class'
import { durationText } from './case-time'

/**
 * **A derivation both tiers draw is written once, and here.**
 *
 * The screens tier is judged on mock data without the app, and the app is what
 * ships - so when the same function exists on both sides the gallery shows the
 * owner values the product never produces, and both sides render. A second
 * `durationText` prints `0m` where this one says `under a minute`; a second
 * action-class map files an unnamed action type under a different fallback.
 *
 * Two halves, because a fork can be a wrong *value* or a second *definition*:
 * the matrix pins what the surviving implementation answers at the inputs the
 * two used to disagree on, and the scan refuses a second definition of any of
 * these names anywhere in `ui/src`.
 */
const HERE = resolve(dirname(fileURLToPath(import.meta.url)))
const SRC = resolve(HERE, '..')

describe('one span vocabulary, at the inputs the two disagreed on', () => {
  const SPANS: readonly (readonly [number, string])[] = [
    [0, 'under a minute'],
    [1000, 'under a minute'],
    [29_000, 'under a minute'],
    // Half a minute is not a minute: the span rounds down, and there is no
    // floor beneath `under a minute` to round up to.
    [30_000, 'under a minute'],
    [59_999, 'under a minute'],
    [90_000, '1m'],
    // A stamp pair the analyst entered the wrong way round.
    [-5000, 'under a minute'],
  ]

  it.each(SPANS)('reads %d ms as %s', (ms, text) => {
    expect(durationText(ms)).toBe(text)
  })
})

describe('one activity class map', () => {
  it.each([[''], ['lateral movement'], [null], [undefined]])(
    'files %o under the fallback class',
    (actionType) => {
      expect(actionClassOf(actionType)).toBe('response')
    },
  )

  /**
   * The whole served vocabulary, written out.
   *
   * A suite built from the vocabulary cannot see a fork: two maps agree over
   * exactly this list and diverge outside it. Asserting that every word gets
   * *some* class proves nothing either, since `response` is the fallback as
   * well as a real answer.
   */
  const VOCABULARY: Readonly<Record<string, string>> = {
    'external notification sent': 'response',
    'external notification received': 'response',
    'internal notification': 'response',
    escalation: 'response',
    'containment action': 'mitigation',
    'remediation action': 'mitigation',
    'investigation started': 'investigation',
    'ticket created': 'investigation',
    'evidence collected': 'investigation',
    other: 'investigation',
  }

  it.each(Object.entries(VOCABULARY))('classes %s as %s', (action, expected) => {
    expect(actionClassOf(action)).toBe(expected)
  })

  it('names every word the vocabulary publishes, and no other', () => {
    // Without this the table above goes quietly out of date: a new action
    // type would be classed by the fallback and asserted by nothing.
    expect([...ACTIVITY_ACTION].sort()).toEqual(Object.keys(VOCABULARY).sort())
  })
})

/**
 * The names that may be defined once, and only under `lib/`.
 *
 * A second *definition* is what re-forks these, whether or not it is exported:
 * a screen with its own `durationText` is the defect this file exists for, and
 * an unexported one renders exactly as well.
 */
const SHARED = [
  'msOf',
  'clockOf',
  'dayKeyOf',
  'dayLabelOf',
  'dayShortOf',
  'stampOf',
  'isoOfEpoch',
  'durationText',
  'actionClassOf',
  'ACTION_CHIP',
  'ACTION_RAIL',
  'ACTION_NOUN',
  'parseStamp',
  'deadline',
  'hoursRemaining',
  'clockFace',
  'dayNumber',
  'NOTIFY_AUTHORITY_HOURS',
]

/** Prose names these functions constantly; a definition is what is refused. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

describe('a shared derivation is defined once', () => {
  const files = glob
    .sync('**/*.{ts,tsx}', { cwd: SRC, absolute: true })
    .map((path) => path.split('\\').join('/'))
    .filter((path) => !path.endsWith('.test.ts') && !path.endsWith('.test.tsx'))

  it('finds the tree to read', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('defines each of them in lib/ and nowhere else', () => {
    const wrong: string[] = []
    for (const file of files) {
      const text = withoutComments(readFileSync(file, 'utf8'))
      for (const name of SHARED) {
        const declared = new RegExp(`\\b(?:function|const|let|var)\\s+${name}\\b`).exec(text)
        if (declared === null) continue
        if (dirname(file) === HERE) continue
        wrong.push(`${relative(SRC, file)} declares ${name}`)
      }
    }
    expect(
      wrong.sort(),
      'a derivation both tiers draw is written once, under lib/',
    ).toEqual([])
  })

  it('holds every one of those names to a definition it can find', () => {
    // A name nobody defines any more would pass the scan above by being
    // absent, which is how a rule keyed on names goes quietly inert.
    const undefinedHere = SHARED.filter((name) => {
      const pattern = new RegExp(`export\\s+(?:function|const)\\s+${name}\\b`)
      return !glob
        .sync('*.ts', { cwd: HERE, absolute: true })
        .some((path) => pattern.test(readFileSync(path, 'utf8')))
    })
    expect(undefinedHere).toEqual([])
  })
})
