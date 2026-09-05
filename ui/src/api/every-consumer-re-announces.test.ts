/**
 * **Every consumer of the case socket re-announces when it reconnects** --
 * which is what `openspec/specs/live/spec.md` asks for:
 *
 * > A connection that drops and returns MUST leave the analyst where they
 * > were. They MUST NOT have to reload to trust what is on their screen.
 *
 * `caseSocket.ts` says how that is achieved, and says it is the consumer's job:
 *
 * > A reconnect is not transparent: the server drops every claim held by a
 * > socket when it closes, and it has no memory of which prose fields this tab
 * > had open. So state announced over this socket has to be announced *again*
 * > on each connect, **by the consumer that owns it**. That is what this
 * > exposes, and why there is no outbound queue.
 *
 * **A rule enforced by memory is the thing this file replaces.** A consumer
 * that acquires the link and never registers `onConnected` works perfectly
 * until the first drop, and then loses whatever it had announced -- a claim, a
 * prose field, a presence entry -- with nothing on screen to say so. The
 * design is right and it is the kind that is quietly stopped being followed.
 *
 * So the subject list is **whoever acquires the link**, read off the source
 * rather than written here. A third consumer added tomorrow is swept the day
 * it is added, which is the only version of this that keeps working.
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
   * **The vacuity guard.** A sweep that found no consumers would satisfy the
   * assertion below and report the rule kept -- and a rename of `acquireLink`
   * is exactly how that would happen.
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
   * **And the link still offers it.** The sweep above is a string match, so it
   * would keep passing if `onConnected` were removed from the interface and the
   * consumers were left calling something that no longer exists -- which
   * `tsc` would catch, but only for the tiers it compiles. Naming it here keeps
   * the two halves of the claim together.
   */
  it('is a method the link actually exposes', () => {
    const link = readFileSync(join(UI_SRC, 'api', 'caseSocket.ts'), 'utf8')
    expect(link).toContain('onConnected(listener: (up: boolean) => void): () => void')
  })
})

/**
 * **A screen re-reads through the interface that decides whether it may.**
 *
 * > #### Scenario: A screen re-reads after an announcement
 * > - GIVEN a screen told that something changed
 * > - WHEN it asks for the new state
 * > - THEN that request is subject to every check any other request is
 *
 * The socket carries no case content, so a screen learns only *that* something
 * moved and asks for it over HTTP, where the guards are.
 * `useCaseChanges.ts` states the rule and the reason:
 *
 * > **Invalidate, never patch.** ... a client applying a row from the wire is
 * > a second implementation of the read path
 *
 * **The failure it prevents is an authorisation one, not a correctness one.**
 * A consumer that seeded the cache from a frame would put case content on
 * screen without any request having been made for it -- and the socket is the
 * one path with no guard, pipe, middleware or interceptor on it. Reach is
 * decided at the handshake and never again, so content arriving after it has
 * been checked by nothing.
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
