/**
 * **Every consumer of the case socket re-announces when it reconnects** --
 * which is what `openspec/specs/live/spec.md` asks for:
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))

/** Everything in `ui/src` that is not itself a test, by absolute path. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sources(path)
    if (!/\.tsx?$/.test(entry.name)) return []
    if (/\.(test|spec)\.tsx?$/.test(entry.name)) return []
    return [path]
  })
}

const UI_SRC = join(HERE, '..')

/** The modules that take a case socket, and are therefore consumers of one. */
function acquirers(): { path: string; text: string }[] {
  return sources(UI_SRC)
    .map((path) => ({ path, text: readFileSync(path, 'utf8') }))
    .filter(({ path, text }) => text.includes('acquireLink(') && !path.endsWith('caseSocket.ts'))
}

describe('every consumer of the case socket re-announces on reconnect', () => {
  /**
   * **The vacuity guard.**
   */
  it('finds the consumers to sweep', () => {
    const found = acquirers().map(({ path }) => path.replace(`${UI_SRC}/`, ''))
    expect(found.length, 'nothing acquires a case socket, so this sweep covers nothing').toBeGreaterThan(
      0,
    )
  })

  it('registers onConnected in every module that acquires a link', () => {
    const silent = acquirers()
      .filter(({ text }) => !text.includes('onConnected('))
      .map(({ path }) => path.replace(`${UI_SRC}/`, ''))

    expect(
      silent,
      'these acquire the socket and never re-announce, so what they announced is lost on the ' +
        'first reconnect and nothing on screen says so',
    ).toEqual([])
  })

  /**
   * **And the link still offers it.**
   */
  it('is a method the link actually exposes', () => {
    const link = readFileSync(join(UI_SRC, 'api', 'caseSocket.ts'), 'utf8')
    expect(link).toContain('onConnected(listener: (up: boolean) => void): () => void')
  })
})

/**
 * **A screen re-reads through the interface that decides whether it may.**
 */
describe('nothing seeds the cache from the socket', () => {
  /** Writing straight into the query cache, by the spellings that do it. */
  const SEEDS = ['setQueryData', 'setQueriesData']

  it('invalidates rather than writing what a frame carried', () => {
    const offenders = acquirers()
      .flatMap(({ path, text }) =>
        SEEDS.filter((spelling) => text.includes(spelling)).map(
          (spelling) => `${path.replace(`${UI_SRC}/`, '')}: ${spelling}`,
        ),
      )

    expect(
      offenders,
      'a socket consumer writes case content into the cache, so it reaches the screen ' +
        'without a request the guards ever saw',
    ).toEqual([])
  })
})
