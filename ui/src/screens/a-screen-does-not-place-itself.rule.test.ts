import { readFileSync } from 'node:fs'
import { basename, dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { glob } from 'glob'
import { describe, expect, it } from 'vitest'

/**
 * **A screen renders where it is put, so putting it somewhere else costs
 * nothing.**
 *
 * ## What it cannot see
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')

/** Prose names these classes to explain them; only code may not use them. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/** A class that measures against the viewport or leaves the page's flow. */
const PLACES_ITSELF = /(?<![\w-])(fixed|inset-0|min-h-screen|h-screen|w-screen)(?![\w-])/g

/** Every string a class could be written in, since `cn()` takes several. */
const LITERAL = /"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g

/**
 * The error boundary, which draws when the shell did not.
 */
const ANSWERED_ELSEWHERE = ['route-error.tsx']

const placedIn = (path: string): string[] => {
  const text = withoutComments(readFileSync(path, 'utf8'))
  const found = new Set<string>()
  for (const match of text.matchAll(LITERAL)) {
    const literal = match[1] ?? match[2] ?? match[3] ?? ''
    for (const token of literal.matchAll(PLACES_ITSELF)) found.add(token[1]!)
  }
  return [...found].sort()
}

describe('a screen renders where it is put', () => {
  const screens = glob
    .sync('**/*.{ts,tsx}', { cwd: HERE, absolute: true })
    .map((path) => path.split('\\').join('/'))
    .filter((path) => !path.endsWith('.stories.tsx') && !/\.test\.tsx?$/.test(path))

  it('finds the tier to read', () => {
    expect(screens.length, 'no screen was found beside this test').toBeGreaterThan(10)
  })

  it('reads a class this rule would refuse, so the sweep is connected', () => {
    const excused = screens.filter((path) => ANSWERED_ELSEWHERE.includes(basename(path)))

    expect(
      excused.length,
      'the excused screen is gone, so the exemption below excuses nothing',
    ).toBeGreaterThan(0)
    expect(
      excused.flatMap(placedIn),
      'the excused screen no longer places itself, so this rule has never been shown to ' +
        'notice one that does -- take the exemption off',
    ).not.toEqual([])
  })

  it.each(
    glob
      .sync('**/*.{ts,tsx}', { cwd: HERE, absolute: true })
      .map((path) => path.split('\\').join('/'))
      .filter((path) => !path.endsWith('.stories.tsx') && !/\.test\.tsx?$/.test(path))
      .filter((path) => !ANSWERED_ELSEWHERE.includes(basename(path)))
      .map((path) => [relative(ROOT, path), path] as const),
  )('%s takes its place from whatever arranges it', (_name, path) => {
    expect(
      placedIn(path),
      'this screen measures itself against the viewport, so it can be put in one place only ' +
        'and the second place somebody wants it is where that is found out',
    ).toEqual([])
  })
})
