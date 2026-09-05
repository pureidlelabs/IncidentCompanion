/**
 * **`request` prepends `API_BASE`, so a caller must not.**
 */
import { readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { globSync } from 'tinyglobby'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, '..')

/**
 * A call whose first argument opens with the base.
 */
const DOUBLED = /\b(request|requestBody|requestRaw)\s*(?:<[^>]*>)?\s*\(\s*[`'"]\/api\//g

describe('a client path is joined to API_BASE, never written with it', () => {
  const files = globSync('**/*.{ts,tsx}', { cwd: SRC, absolute: true }).filter(
    (path) => !path.endsWith('.test.ts') && !path.endsWith('.test.tsx'),
  )

  it('finds the client code at all', () => {
    // Without this the sweep below passes over an empty list, which is what a
    // moved directory looks like from here.
    expect(files.length).toBeGreaterThan(50)
  })

  it('never passes a path that already carries the base', () => {
    const offenders: string[] = []
    for (const path of files) {
      const text = readFileSync(path, 'utf8')
      for (const match of text.matchAll(DOUBLED)) {
        const line = text.slice(0, match.index).split('\n').length
        offenders.push(`${relative(SRC, path)}:${String(line)}  ${match[0].trim()}`)
      }
    }

    expect(
      offenders,
      'these produce /api/api/... , which the SPA catch-all answers as HTML',
    ).toEqual([])
  })
})
