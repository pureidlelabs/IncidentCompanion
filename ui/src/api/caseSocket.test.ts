/**
 * The shared case socket.
 *
 * jsdom defines no `WebSocket` at all, so the link takes a factory and this
 * file supplies a fake. That is not a testing convenience: the properties
 * worth asserting here are *sharing* and *what happens across a drop*, and
 * neither is reachable through a real socket in any tier this project runs.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  acquireLink, decode, heldBy, releaseLink, socketUrl,
  type Message, type SocketLike,
} from './caseSocket'

/** Every socket the fake factory has handed out, newest last. */
let made: FakeSocket[] = []

class FakeSocket implements SocketLike {
  readyState = 0
  sent: Message[] = []
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  closed = false

  constructor(readonly url: string) { made.push(this) }

  send(data: string) { this.sent.push(JSON.parse(data) as Message) }
  close() { this.closed = true }

  // The events are never read - only `data` is - so they are stubbed rather
  // than constructed. jsdom has no `CloseEvent` to build in any case.
  open() { this.readyState = 1; this.onopen?.({} as Event) }
  deliver(message: unknown) {
    const data = typeof message === 'string' ? message : JSON.stringify(message)
    this.onmessage?.({ data } as MessageEvent)
  }
  drop() { this.readyState = 3; this.onclose?.({} as CloseEvent) }
}

const factory = (url: string) => new FakeSocket(url)

afterEach(() => {
  for (const id of ['C-1', 'C-2']) while (heldBy(id) > 0) releaseLink(id)
  made = []
  vi.useRealTimers()
})

describe('one socket per case', () => {
  it('hands two consumers the same socket', () => {
    // The property the whole module exists for. The server builds the roster
    // by counting connections, so a second socket puts the analyst in their
    // own avatar stack twice.
    const one = acquireLink('C-1', factory)
    const two = acquireLink('C-1', factory)

    expect(one).toBe(two)
    expect(made).toHaveLength(1)
  })

  it('opens a separate socket per case', () => {
    acquireLink('C-1', factory)
    acquireLink('C-2', factory)

    expect(made.map((s) => s.url)).toEqual([socketUrl('C-1'), socketUrl('C-2')])
  })

  it('keeps the socket open while anyone still holds it', () => {
    acquireLink('C-1', factory)
    acquireLink('C-1', factory)
    releaseLink('C-1')

    expect(made[0]?.closed).toBe(false)
  })

  it('closes it when the last holder lets go', () => {
    acquireLink('C-1', factory)
    acquireLink('C-1', factory)
    releaseLink('C-1')
    releaseLink('C-1')

    expect(made[0]?.closed).toBe(true)
  })

  it('opens a fresh socket after the last holder left', () => {
    // Not the shut one: it reconnects nothing, so handing it back would give
    // the next consumer a dead link that never reports a drop.
    acquireLink('C-1', factory)
    releaseLink('C-1')
    acquireLink('C-1', factory)

    expect(made).toHaveLength(2)
    expect(made[1]?.closed).toBe(false)
  })

  it('ignores a release nobody holds', () => {
    expect(() => releaseLink('C-1')).not.toThrow()
  })
})

describe('announcing across a reconnect', () => {
  it('tells a consumer that mounts into an already-open socket', () => {
    // Presence mounts with the shell and a prose field mounts when a section
    // is opened, so the second one routinely arrives after the connect. If it
    // only heard about *future* connects it would never announce at all --
    // the field would stay unsynced until the next drop.
    const link = acquireLink('C-1', factory)
    made[0]?.open()

    const seen: boolean[] = []
    link.onConnected((up) => seen.push(up))

    expect(seen).toEqual([true])
  })

  it('reports the drop and the connect that follows it', () => {
    // The server forgets every claim held by a socket when it closes, and it
    // never knew which prose fields this tab had open. Both are re-announced
    // from here, so a consumer that is not told twice stops being protected.
    vi.useFakeTimers()
    const link = acquireLink('C-1', factory)
    const seen: boolean[] = []
    link.onConnected((up) => seen.push(up))

    made[0]?.open()
    made[0]?.drop()
    vi.advanceTimersByTime(600)
    made[1]?.open()

    expect(seen).toEqual([false, true, false, true])
  })

  it('stops reconnecting once the last holder has gone', () => {
    vi.useFakeTimers()
    acquireLink('C-1', factory)
    made[0]?.open()
    releaseLink('C-1')
    made[0]?.drop()
    vi.advanceTimersByTime(60_000)

    expect(made).toHaveLength(1)
  })

  it('backs off rather than reconnecting in a tight loop', () => {
    // A server that is down answers instantly, so a fixed retry is a request
    // flood against a machine that is already unwell.
    vi.useFakeTimers()
    acquireLink('C-1', factory)
    made[0]?.drop()
    vi.advanceTimersByTime(500)
    made[1]?.drop()
    vi.advanceTimersByTime(500)

    expect(made).toHaveLength(2)
    vi.advanceTimersByTime(500)
    expect(made).toHaveLength(3)
  })
})

describe('sending and receiving', () => {
  it('drops a send while the socket is down', () => {
    // Silently, and that is the design: a claim is advisory, and the edit is
    // protected by the row version rather than by this.
    const link = acquireLink('C-1', factory)
    expect(() => link.send({ type: 'claim' })).not.toThrow()
    expect(made[0]?.sent).toEqual([])
  })

  it('sends once open', () => {
    const link = acquireLink('C-1', factory)
    made[0]?.open()
    link.send({ type: 'claim', table: 'timeline', id: 't-1' })

    expect(made[0]?.sent).toEqual([{ type: 'claim', table: 'timeline', id: 't-1' }])
  })

  it('gives every subscriber every message', () => {
    // Presence and prose share the socket, and each has to see frames the
    // other cares about pass by -- a reader that consumed what it recognised
    // would starve whichever mounted second.
    const link = acquireLink('C-1', factory)
    const a: Message[] = []
    const b: Message[] = []
    link.subscribe((m) => a.push(m))
    link.subscribe((m) => b.push(m))
    made[0]?.deliver({ type: 'presence', roster: [] })

    expect(a).toEqual(b)
    expect(a).toHaveLength(1)
  })

  it('stops delivering after unsubscribe', () => {
    const link = acquireLink('C-1', factory)
    const seen: Message[] = []
    const stop = link.subscribe((m) => seen.push(m))
    stop()
    made[0]?.deliver({ type: 'presence' })

    expect(seen).toEqual([])
  })

  it('keeps delivering when one subscriber throws', () => {
    // A prose payload this build cannot decode must not take the roster down
    // with it. The listener set is copied before iterating for the same
    // reason a subscriber may unsubscribe from inside its own callback.
    const link = acquireLink('C-1', factory)
    const seen: Message[] = []
    link.subscribe(() => { throw new Error('bad frame') })
    link.subscribe((m) => seen.push(m))

    expect(() => made[0]?.deliver({ type: 'presence' })).not.toThrow()
    expect(seen).toHaveLength(1)
  })
})

describe('decode', () => {
  it('reads an object frame', () => {
    expect(decode('{"type":"presence"}')).toEqual({ type: 'presence' })
  })

  it('ignores a binary frame', () => {
    // Awareness updates are binary in other Yjs transports,
    // and a reader that assumed text would throw on somebody else's caret.
    expect(decode(new ArrayBuffer(4))).toBeNull()
  })

  it('ignores text that is not JSON', () => {
    expect(decode('<html>a proxy error page</html>')).toBeNull()
  })

  it('ignores a JSON array', () => {
    // `typeof [] === 'object'`, so an array reaches a reader looking for
    // `message.type` as `undefined` rather than being rejected.
    expect(decode('[1,2]')).toBeNull()
  })

  it('ignores a scalar and a null', () => {
    expect(decode('42')).toBeNull()
    expect(decode('null')).toBeNull()
  })
})
