/**
 * Every address the client asks for is one the published document offers.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { globSync } from 'tinyglobby'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, type Harness } from './app-harness.js'

const API = fileURLToPath(new URL('../../ui/src', import.meta.url))

/**
 * The three helpers that reach the server, and the opening of their first
 * argument.
 */
const CALL = /\b(?:request|requestBody|requestRaw)\s*(?:<[^>]*>\s*)?\(\s*(['"`])([^'"`]*)\1/g

/** Trailing slash off, so `/specs` and `/specs/` are one address. */
const shape = (path: string): string => path.replace(/\/+$/, '')

/**
 * Every **fixed** address the client asks for, with the file that asks.
 */
function asked(): { path: string; where: string }[] {
  const found: { path: string; where: string }[] = []
  for (const file of globSync('**/*.{ts,tsx}', { cwd: API, absolute: true })) {
    if (/\.(test|stories)\.tsx?$/.test(file)) continue
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(CALL)) {
      const raw = match[2]
      if (raw === undefined || !raw.startsWith('/') || raw.includes('${')) continue
      found.push({ path: raw, where: file.slice(API.length + 1) })
    }
  }
  return found
}

let harness: Harness | null = null

describe.skipIf(!(await bootable()))('the addresses the client asks for', () => {
  beforeAll(async () => {
    harness = await boot()
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  it('finds calls to sweep, so a renamed helper does not empty this', () => {
    expect(asked().length).toBeGreaterThan(15)
  })

  it('publishes every fixed one of them', () => {
    const published = new Set(
      Object.keys(harness!.document.paths ?? {})
        .filter((one) => !one.includes('{'))
        .map((one) => shape(one.replace(/^\/api/, ''))),
    )
    expect(published.size, 'the document offered no paths to compare against').toBeGreaterThan(20)

    const missing = [...new Set(
      asked()
        .filter(({ path }) => !published.has(shape(path)))
        .map(({ path, where }) => `${path}  (${where})`),
    )].sort()

    expect(
      missing,
      'the client asks for these and the published document does not offer them, so a ' +
        'caller building from the document cannot do what the screens do',
    ).toEqual([])
  })
})
