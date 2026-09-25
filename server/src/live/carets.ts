/**
 * Which connection holds each caret on a case, and the awareness update a
 * connection may relay: its own carets, named for its own analyst.
 */
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import type { WebSocket } from 'ws'

/** How many carets one connection may hold. A browser holds one per open document. */
const CARETS_PER_CONNECTION = 256

interface Holder {
  live: WebSocket
  userId: string
}

export class Carets {
  /** By `caseId:clientId`. */
  private readonly held = new Map<string, Holder>()
  private readonly byConnection = new Map<WebSocket, Set<string>>()

  /**
   * `update` as `live` may relay it, or null when nothing in it is theirs.
   *
   * Keeps the entries for client ids this connection holds or takes now, and
   * drops the rest; a client id held by another connection of the same
   * analyst is taken over. Every kept state is named `name`, whatever it said.
   * Null too for an update that does not decode.
   */
  vouch(caseId: string, live: WebSocket, userId: string, name: string, update: Uint8Array): Uint8Array | null {
    const mine = this.byConnection.get(live) ?? new Set<string>()
    const kept: [number, number, string][] = []
    try {
      const decoder = decoding.createDecoder(update)
      const count = decoding.readVarUint(decoder)
      for (let i = 0; i < count; i += 1) {
        const client = decoding.readVarUint(decoder)
        const clock = decoding.readVarUint(decoder)
        const state = JSON.parse(decoding.readVarString(decoder)) as unknown
        const key = `${caseId}:${String(client)}`
        const holder = this.held.get(key)
        if (holder && holder.live !== live && holder.userId !== userId) continue
        if (!mine.has(key)) {
          if (mine.size >= CARETS_PER_CONNECTION) continue
          if (holder) this.byConnection.get(holder.live)?.delete(key)
          mine.add(key)
          this.held.set(key, { live, userId })
        }
        // `null` is the caret leaving, and names nobody.
        if (state !== null && (typeof state !== 'object' || Array.isArray(state))) continue
        kept.push([client, clock, JSON.stringify(state && named(state as Record<string, unknown>, name))])
      }
    } catch {
      return null
    }
    this.byConnection.set(live, mine)
    if (kept.length === 0) return null

    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, kept.length)
    for (const [client, clock, state] of kept) {
      encoding.writeVarUint(encoder, client)
      encoding.writeVarUint(encoder, clock)
      encoding.writeVarString(encoder, state)
    }
    return encoding.toUint8Array(encoder)
  }

  /** Lets go of every caret `live` holds. */
  release(live: WebSocket): void {
    for (const key of this.byConnection.get(live) ?? []) {
      if (this.held.get(key)?.live === live) this.held.delete(key)
    }
    this.byConnection.delete(live)
  }
}

/** The colour stays the sender's: the editor draws only a `#rrggbb` one, and a colour names nobody. */
function named(state: Record<string, unknown>, name: string): Record<string, unknown> {
  const user = state['user']
  const color = typeof user === 'object' && user !== null ? (user as { color?: unknown }).color : undefined
  return { ...state, user: { ...(typeof color === 'string' ? { color } : {}), name } }
}
