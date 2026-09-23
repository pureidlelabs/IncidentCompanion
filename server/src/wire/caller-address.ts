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

/** How long a peer found not to be the edge is believed not to be. */
const LOOKUP_INTERVAL_MS = 5_000

/** Each peer found not to be the edge, with when and by which lookup. */
const checked = new Map<string, { at: number; lookup: Promise<void> }>()

/**
 * Look the edge up by name and replace the addresses believed as it.
 *
 * `name` unset names no edge: every request is then attributed to its own
 * peer. A name that does not resolve leaves the set empty rather than
 * throwing, since the edge may start after the application.
 */
export async function findTheEdge(name: string | undefined): Promise<void> {
  edgeName = name
  const found = name
    ? await lookup(name, { all: true }).then(
        (answers) => answers.map(({ address }) => address),
        () => [],
      )
    : []
  edge.splice(0, edge.length, ...found)
}

/** Whether `peer` is the edge, looking the edge up first when this peer was not checked lately. */
async function isTheEdge(peer: string): Promise<boolean> {
  if (edge.includes(peer)) return true
  if (!edgeName) return false
  let check = checked.get(peer)
  if (!check || Date.now() - check.at >= LOOKUP_INTERVAL_MS) {
    check = { at: Date.now(), lookup: findTheEdge(edgeName) }
    checked.set(peer, check)
  }
  await check.lookup
  return edge.includes(peer)
}

/**
 * Rewrite `x-forwarded-for` so the chain ends at the TCP peer, before anything
 * reads an address. Await it once per request, first.
 *
 * A peer that is not the edge is attributed to itself, whatever it sent. A
 * peer not checked in the last few seconds waits for the edge to be looked up
 * again first.
 */
export async function attribute(
  headers: IncomingHttpHeaders,
  socketPeer: string | undefined,
): Promise<void> {
  const peer = socketPeer?.replace(/^::ffff:/, '')
  const handed = headers[CHAIN]
  delete headers[CHAIN]
  if (!peer) return
  const chain = (await isTheEdge(peer)) && typeof handed === 'string' && handed !== ''
  headers[CHAIN] = chain ? `${handed}, ${peer}` : peer
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
