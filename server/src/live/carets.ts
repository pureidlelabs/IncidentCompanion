/**
 * Which connection holds each caret on a case, and the awareness update a
 * connection may relay: its own carets, named for its own analyst.
 */
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import type { WebSocket } from 'ws'

/** How many carets one connection may hold. A browser holds one per open document. */
const CARETS_PER_CONNECTION = 256

/** How long a released caret stays its analyst's: the time a peer takes to forget it. */
const KEPT_FOR_RETURN_MS = 30_000

interface Holder {
  live: WebSocket
  userId: string
}

export class Carets {
  /** By `caseId:clientId`. */
  private readonly held = new Map<string, Holder>()
  private readonly byConnection = new Map<WebSocket, Set<string>>()
  /** Carets a closed connection held, kept for its analyst until `until`. */
  private readonly kept = new Map<string, { userId: string; until: number }>()

  /**
   * `update` as `live` may relay it, or null when nothing in it is theirs.
   *
   * Keeps the entries for client ids this connection holds or takes now, and
   * drops the rest; a client id held by, or kept for, the same analyst is
   * taken over. Every kept state is named `name`, whatever it said. An update
   * that does not decode whole is null and changes nothing.
   */
  vouch(caseId: string, live: WebSocket, userId: string, name: string, update: Uint8Array): Uint8Array | null {
    const entries = decoded(update)
    if (!entries) return null

    const mine = this.byConnection.get(live) ?? new Set<string>()
    this.byConnection.set(live, mine)
    const now = Date.now()
    const relayed: [number, number, string][] = []
    for (const [client, clock, state] of entries) {
      const key = `${caseId}:${String(client)}`
      if (!mine.has(key)) {
        const holder = this.held.get(key)
        if (holder && holder.userId !== userId) continue
        const kept = this.kept.get(key)
        if (kept && kept.userId !== userId && kept.until > now) continue
        if (mine.size >= CARETS_PER_CONNECTION) continue
        if (holder) this.byConnection.get(holder.live)?.delete(key)
        this.kept.delete(key)
        mine.add(key)
        this.held.set(key, { live, userId })
      }
      relayed.push([client, clock, JSON.stringify(state && named(state, name))])
    }
    if (relayed.length === 0) return null

    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, relayed.length)
    for (const [client, clock, state] of relayed) {
      encoding.writeVarUint(encoder, client)
      encoding.writeVarUint(encoder, clock)
      encoding.writeVarString(encoder, state)
    }
    return encoding.toUint8Array(encoder)
  }

  /** Lets go of every caret `live` holds, keeping each for its analyst to take back. */
  release(live: WebSocket): void {
    const now = Date.now()
    for (const [key, kept] of this.kept) if (kept.until <= now) this.kept.delete(key)
    for (const key of this.byConnection.get(live) ?? []) {
      const holder = this.held.get(key)
      if (holder?.live !== live) continue
      this.held.delete(key)
      this.kept.set(key, { userId: holder.userId, until: now + KEPT_FOR_RETURN_MS })
    }
    this.byConnection.delete(live)
  }
}

/** Every entry of an awareness update, or null when any of it does not decode or is not a state. */
function decoded(update: Uint8Array): [number, number, Record<string, unknown> | null][] | null {
  try {
    const decoder = decoding.createDecoder(update)
    const entries: [number, number, Record<string, unknown> | null][] = []
    for (let count = decoding.readVarUint(decoder); count > 0; count -= 1) {
      const client = decoding.readVarUint(decoder)
      const clock = decoding.readVarUint(decoder)
      const state = JSON.parse(decoding.readVarString(decoder)) as unknown
      // `null` is the caret leaving, and names nobody.
      if (state !== null && (typeof state !== 'object' || Array.isArray(state))) return null
      entries.push([client, clock, state as Record<string, unknown> | null])
    }
    return entries
  } catch {
    return null
  }
}

/** The colour stays the sender's: the editor draws only a `#rrggbb` one, and a colour names nobody. */
function named(state: Record<string, unknown>, name: string): Record<string, unknown> {
  const user = state['user']
  const color = typeof user === 'object' && user !== null ? (user as { color?: unknown }).color : undefined
  return { ...state, user: { ...(typeof color === 'string' ? { color } : {}), name } }
}
