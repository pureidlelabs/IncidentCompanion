/**
 * Reading the case socket.
 */
import { describe, expect, it } from 'vitest'

import { readMessage, socketUrl } from './presence'

const snapshot = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ type: 'presence', roster: [], claims: [], ...extra })

describe('readMessage', () => {
  it('reads a roster and its claims', () => {
    const message = snapshot({
      roster: [{ username: 'r.okonkwo', joined_at: 1, last_seen: 2, connections: 3 }],
      claims: [{ table: 'timeline', entry_id: 't-1', username: 'r.okonkwo',
                 session_id: 'ws-1', taken_at: 1 }],
    })
    const read = readMessage(message)
    expect(read).not.toBeNull()
    expect(read?.roster.at(0)?.username).toBe('r.okonkwo')
    expect(read?.claims.at(0)?.entry_id).toBe('t-1')
  })

  it('ignores a message of a kind it does not know', () => {
    // The server ignores unknown messages from the client for the same reason
    // and it has to hold in both directions: a tab open across an upgrade
    // meets a server sending things this build has never heard of, and
    // treating that as fatal takes the analyst's presence down with it.
    expect(readMessage(JSON.stringify({ type: 'from-a-later-release' }))).toBeNull()
  })

  it('ignores anything that is not JSON', () => {
    expect(readMessage('<html>a proxy error page</html>')).toBeNull()
  })

  it('ignores a payload that is not an object', () => {
    expect(readMessage('42')).toBeNull()
    expect(readMessage('null')).toBeNull()
  })

  it('ignores binary frames', () => {
    // The prose CRDT will share this socket and its updates are binary. A
    // reader that assumed every frame was text would throw on the first
    // keystroke somebody else typed.
    expect(readMessage(new ArrayBuffer(8))).toBeNull()
  })

  it('survives a roster that is not an array', () => {
    // Defensive rather than expected: the alternative is `.map` of undefined
    // inside a render, which blanks the screen rather than the avatar rail.
    expect(readMessage(snapshot({ roster: 'nope' }))?.roster).toEqual([])
  })
})

describe('socketUrl', () => {
  it('uses wss when the page is https', () => {
    // The app is TLS-only, so ws:// is the branch that never runs in
    // production and would fail the mixed-content rule if it did.
    expect(socketUrl('RT-0001', {
      protocol: 'https:', host: 'localhost:8443',
    } as Location)).toBe('wss://localhost:8443/api/cases/RT-0001/live')
  })

  it('uses ws when the page is not', () => {
    expect(socketUrl('RT-0001', {
      protocol: 'http:', host: 'localhost:5173',
    } as Location)).toBe('ws://localhost:5173/api/cases/RT-0001/live')
  })

  it('escapes a case id rather than pasting it into the path', () => {
    expect(socketUrl('a b/../c', {
      protocol: 'https:', host: 'h',
    } as Location)).toBe('wss://h/api/cases/a%20b%2F..%2Fc/live')
  })
})
