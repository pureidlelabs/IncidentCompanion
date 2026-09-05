/**
 * Nothing that responds to a click is a plain element with a handler on it.
 */
import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { globSync } from 'tinyglobby'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(HERE, '../')

/**
 * Where a plain element carries a handler and that is right, with the reason.
 */
const ANSWERED_ELSEWHERE: readonly string[] = ['components/blocks/choice-row.tsx']

/** Lower-case tags that already answer a keyboard. Anything capitalised is a component. */
const KEYBOARD_NATIVE = new Set(['button', 'a', 'input', 'select', 'textarea', 'label', 'form'])

/** The tag a handler at `at` belongs to, or undefined if none opened before it. */
function tagFor(text: string, at: number): string | undefined {
  const opened = text.lastIndexOf('<', at)
  if (opened === -1) return undefined
  return /^<\s*([A-Za-z][\w.-]*)/.exec(text.slice(opened, opened + 40))?.[1]
}

function handWired(file: string): string[] {
  const text = readFileSync(file, 'utf8')
  const found: string[] = []
  for (const match of text.matchAll(/\bonClick\b/g)) {
    const tag = tagFor(text, match.index)
    if (tag === undefined) continue
    const native = tag.toLowerCase() === tag
    if (native && !KEYBOARD_NATIVE.has(tag)) found.push(tag)
  }
  return found
}

describe('a control an analyst can click', () => {
  const files = globSync('**/*.tsx', { cwd: SRC, absolute: true }).filter(
    (one) => !/\.(test|stories)\.tsx$/.test(one),
  )

  it('has components to read, so a moved directory does not empty this', () => {
    expect(files.length, 'no component was found to read').toBeGreaterThan(30)
    expect(
      files.some((one) => readFileSync(one, 'utf8').includes('onClick')),
      'no click handler was found anywhere, so this rule is asserting nothing',
    ).toBe(true)
  })

  it('is never a plain element with a click handler hung on it', () => {
    const offenders = files
      .filter((file) => !ANSWERED_ELSEWHERE.includes(relative(SRC, file)))
      .flatMap((file) => handWired(file).map((tag) => `${relative(SRC, file)}: <${tag}>`))
      .sort()

    expect(
      offenders,
      'these hang a click handler on an element that answers no keyboard: no tab stop, no ' +
        'Enter or Space, no role and no name. Use a control from the kit, or a button. If ' +
        'the keyboard reaches it another way, say where in ANSWERED_ELSEWHERE',
    ).toEqual([])
  })

  it('exempts nothing that has stopped needing it', () => {
    const idle = ANSWERED_ELSEWHERE.filter((named) => {
      const file = files.find((one) => relative(SRC, one) === named)
      return file === undefined || handWired(file).length === 0
    })

    expect(
      idle,
      'these are exempted and no longer hang a handler on a plain element, so the exemption ' +
        'is now permission nobody asked for',
    ).toEqual([])
  })
})
