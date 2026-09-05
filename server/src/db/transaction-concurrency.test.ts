/**
 * A transaction holds one connection, so its queries may not be fired at once.
 *
 * **A sweep rather than a unit test**, because the property is about every
 * call site and a unit test on the helper says nothing about the file that did
 * not use it. Nothing behavioural can stand in for it either: `pg` serialises
 * the queries today, so the suite is green on the defect until `pg@9`.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { globSync } from 'tinyglobby'
import { describe, expect, it } from 'vitest'

const SOURCE = fileURLToPath(new URL('..', import.meta.url))

/** Opens a transaction and hands its callback a pinned connection. */
const OPENS_A_TRANSACTION = /\b(?:withCase|\.transaction)\s*\(/g

/** Fires everything it is given at once -- all four of them do. */
const CONCURRENT = /\bPromise\.(?:all|allSettled|race|any)\s*\(/

/**
 * The callback body, by brace depth from the opening call.
 */
function callbackBody(text: string, from: number): string {
  let depth = 0
  for (let at = from; at < text.length; at += 1) {
    const character = text[at]
    if (character === '(' || character === '{') depth += 1
    else if (character === ')' || character === '}') {
      depth -= 1
      if (depth === 0) return text.slice(from, at)
    }
  }
  return text.slice(from)
}

describe('queries inside a transaction', () => {
  const files = globSync('**/*.ts', { cwd: SOURCE, absolute: true }).filter(
    (path) => !path.endsWith('.test.ts'),
  )

  it('reads a non-empty set of sources', () => {
    // A sweep over an empty glob passes and enforces nothing.
    expect(files.length).toBeGreaterThan(50)
  })

  it('are never fired concurrently', () => {
    const offenders: string[] = []
    for (const path of files) {
      const text = readFileSync(path, 'utf8')
      for (const opener of text.matchAll(OPENS_A_TRANSACTION)) {
        const body = callbackBody(text, opener.index ?? 0)
        if (CONCURRENT.test(body)) {
          const line = text.slice(0, opener.index).split('\n').length
          offenders.push(`${path.slice(SOURCE.length)}:${line}`)
        }
      }
    }

    expect(
      offenders,
      'a transaction is one connection: fire its queries in series (see `inSeries`)',
    ).toEqual([])
  })
})
