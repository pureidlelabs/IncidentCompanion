/**
 * Who a request is attributed to: resolved once, by Better Auth's own rule,
 * for the rate limiters, the audit and the session record alike.
 *
 * The door (`attribute`) writes the one fact the library cannot see, the TCP
 * peer, onto the end of `x-forwarded-for`, and keeps what came before only
 * when that peer is the edge. Better Auth then walks the chain from the right,
 * skipping the edge as a trusted proxy. -> `openspec/specs/deployment/design.md`
 */
import { lookup } from 'node:dns/promises'
import type { IncomingHttpHeaders } from 'node:http'

import { getIP } from 'better-auth/api'

const CHAIN = 'x-forwarded-for'

/** The edge's addresses, replaced in place so the object below always reads the current set. */
const edge: string[] = []

/**
 * `advanced.ipAddress` for Better Auth, and the rule `callerAddress` applies.
 *
 * Handed to the library by reference: the edge's addresses are filled in after
 * the auth instance is built, and whenever the edge is found again.
 */
export const ADDRESS_RULE = { ipAddressHeaders: [CHAIN], trustedProxies: edge }

let edgeName: string | undefined
let lookedUpAt = 0

/** How long a miss waits before the edge is looked up again. */
const LOOKUP_INTERVAL_MS = 5_000

/**
 * Look the edge up by name and replace the addresses believed as it.
 *
 * `name` unset names no edge: every request is then attributed to its own
 * peer. A name that does not resolve leaves the set empty rather than
 * throwing, since the edge starts after the application.
 */
export async function findTheEdge(name: string | undefined): Promise<void> {
  edgeName = name
  lookedUpAt = Date.now()
  const found = name
    ? await lookup(name, { all: true }).then(
        (answers) => answers.map(({ address }) => address),
        () => [],
      )
    : []
  edge.splice(0, edge.length, ...found)
}

/**
 * Rewrite `x-forwarded-for` so the chain ends at the TCP peer, before anything
 * reads an address. Call once per request, first.
 *
 * A peer that is not the edge is attributed to itself, whatever it sent. A
 * miss looks the edge up again at most once per interval, in the background,
 * so a recreated edge is found and a flood of direct callers costs nothing.
 */
export function attribute(headers: IncomingHttpHeaders, socketPeer: string | undefined): void {
  const peer = socketPeer?.replace(/^::ffff:/, '')
  const handed = headers[CHAIN]
  delete headers[CHAIN]
  if (!peer) return
  if (edge.includes(peer)) {
    headers[CHAIN] = typeof handed === 'string' && handed !== '' ? `${handed}, ${peer}` : peer
    return
  }
  headers[CHAIN] = peer
  if (edgeName && Date.now() - lookedUpAt >= LOOKUP_INTERVAL_MS) void findTheEdge(edgeName)
}

/**
 * The address to attribute a request to, or `null` when there is none.
 *
 * `headers` must have passed `attribute`. Better Auth answers `127.0.0.1`
 * rather than `null` in development and test.
 */
export function callerAddress(headers: IncomingHttpHeaders | Record<string, string>): string | null {
  const asked = new Headers()
  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === 'string') asked.set(name, value)
  }
  return getIP(asked, { advanced: { ipAddress: ADDRESS_RULE } })
}

/**
 * **A caller with no address is counted as one bucket per route, not as one
 * bucket for everybody.** Both wrong answers are worse: sharing a single
 * bucket lets one unidentifiable caller lock out every other unidentifiable
 * caller, and skipping the limit lets an attacker opt out of it.
 */
export const NO_ADDRESS = 'no-address'
