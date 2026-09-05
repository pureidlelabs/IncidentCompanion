/**
 * Who else is in this case, over the case socket.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  acquireLink, releaseLink, socketUrl, type CaseLink, type Message,
} from './caseSocket'

export { socketUrl }

/** One analyst in the case, however many tabs they have open. */
export interface Participant {
  /**
   * **The stable one; `username` is for reading.**
   */
  user_id: string
  username: string
  joined_at: number
  last_seen: number
  connections: number
}

/** One analyst holding one row. */
export interface Claim {
  table: string
  entry_id: string
  /**
   * **What *is this mine* is decided from.**
   */
  user_id: string
  username: string
  session_id: string
  taken_at: number
}

export interface PresenceSnapshot {
  roster: Participant[]
  claims: Claim[]
}

export interface CasePresence extends PresenceSnapshot {
  /** False while reconnecting. The marks hide rather than going stale. */
  connected: boolean
  claim: (table: string, entryId: string) => void
  release: (table: string, entryId: string) => void
  /** Who holds this row, or undefined. */
  holderOf: (table: string, entryId: string) => Claim | undefined
}

const EMPTY: PresenceSnapshot = { roster: [], claims: [] }

/**
 * Read one server message into a snapshot, or return null to ignore it.
 */
export function readMessage(data: unknown): PresenceSnapshot | null {
  if (typeof data !== 'string') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  return readSnapshot(parsed as Message)
}

/** The same decision, over a frame `caseSocket` has already parsed. */
export function readSnapshot(message: Message): PresenceSnapshot | null {
  if (message.type !== 'presence') return null
  return {
    roster: Array.isArray(message.roster) ? (message.roster as Participant[]) : [],
    claims: Array.isArray(message.claims) ? (message.claims as Claim[]) : [],
  }
}

/** The real socket, absent in jsdom - which defines no `WebSocket` at all. */
function browserSocket(url: string) {
  return new WebSocket(url)
}

export function useCasePresence(caseId: string): CasePresence {
  const [snapshot, setSnapshot] = useState<PresenceSnapshot>(EMPTY)
  const [connected, setConnected] = useState(false)
  const link = useRef<CaseLink | null>(null)

  /**
   * **The rows this tab is holding, so they can be taken again.**
   */
  const held = useRef(new Map<string, { table: string; entryId: string }>())

  useEffect(() => {
    if (typeof WebSocket === 'undefined') return undefined
    const live = acquireLink(caseId, browserSocket)
    link.current = live

    const stopMessages = live.subscribe((message) => {
      const next = readSnapshot(message)
      if (next) setSnapshot(next)
    })
    const stopConnected = live.onConnected((up) => {
      setConnected(up)
      if (!up) {
        // The roster is cleared, not frozen. A stale stack is worse than an
        // empty one: it says three analysts are in the case when this tab has
        // not heard from the server since they might all have left.
        setSnapshot(EMPTY)
        return
      }
      for (const { table, entryId } of held.current.values()) {
        live.send({ type: 'claim', table, id: entryId })
      }
    })

    return () => {
      stopMessages()
      stopConnected()
      link.current = null
      releaseLink(caseId)
    }
  }, [caseId])

  const claim = useCallback((table: string, entryId: string) => {
    held.current.set(key(table, entryId), { table, entryId })
    link.current?.send({ type: 'claim', table, id: entryId })
    // Dropped silently when the socket is down. A claim is advisory, so the
    // edit still goes ahead and is still protected by the row version -- the
    // analyst just does not get to warn anyone first. It is re-sent on the
    // next connect, which is what `held` is for.
  }, [])

  const release = useCallback((table: string, entryId: string) => {
    held.current.delete(key(table, entryId))
    link.current?.send({ type: 'release', table, id: entryId })
  }, [])

  const byRow = useMemo(() => {
    const map = new Map<string, Claim>()
    for (const claimed of snapshot.claims) {
      map.set(key(claimed.table, claimed.entry_id), claimed)
    }
    return map
  }, [snapshot.claims])

  const holderOf = useCallback(
    (table: string, entryId: string) => byRow.get(key(table, entryId)), [byRow])

  return {
    roster: snapshot.roster,
    claims: snapshot.claims,
    connected,
    claim,
    release,
    holderOf,
  }
}

/** `table:id`. Table names are a closed set and carry no colon. */
function key(table: string, entryId: string): string {
  return `${table}:${entryId}`
}

/**
 * Take a row while an editor is open on it, and give it back on close.
 */
export function useRowClaim(
  presence: Pick<CasePresence, 'claim' | 'release'>,
  table: string,
  entryId: string | undefined,
): void {
  const { claim, release } = presence
  useEffect(() => {
    if (!entryId) return undefined
    claim(table, entryId)
    return () => release(table, entryId)
  }, [claim, release, table, entryId])
}
