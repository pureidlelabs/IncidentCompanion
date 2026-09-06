/**
 * The roster and the claims, over a fake store.
 *
 * **No Redis and no socket here.** The decisions worth asserting are *who is
 * counted as one analyst*, *what happens to a claim when a connection goes*,
 * and *who is told* - none of which a real server makes more true, and all of
 * which it makes slower to arrange. What Redis genuinely adds, TTL expiry and
 * cross-process fan-out, is not decidable in this tier at all and is stated in
 * `presence.store.ts` rather than pretended at here.
 *
 * The fake keeps the store's semantics that the channel depends on: a release
 * only by the holder, and a leave that drops that connection's claims.
 */
import { describe, expect, it } from 'vitest'

import { CaseChannel, type Member } from './case-channel.service.js'
import type { PresenceCoordinator, StoredClaim, StoredMember } from './presence.store.js'

/**
 * Typed against `PresenceCoordinator` - the methods `CaseChannel` calls - so a
 * fake missing one or carrying the wrong signature is a compile error.
 *
 * **Never `implements PresenceStore`**, which cannot compile: that class keeps
 * private state, and TypeScript satisfies a private member only through
 * inheritance. Reaching for `as unknown as` instead is what let this fake drift
 * from the real store unseen.
 */
class FakeStore implements PresenceCoordinator {
  private readonly rooms = new Map<string, StoredMember[]>()
  private readonly held = new Map<string, StoredClaim[]>()
  private readonly readers = new Map<string, ((payload: string) => void)[]>()

  join(caseId: string, member: StoredMember): Promise<void> {
    this.rooms.set(caseId, [...(this.rooms.get(caseId) ?? []), member])
    return Promise.resolve()
  }

  leave(caseId: string, sessionId: string): Promise<void> {
    this.rooms.set(caseId, (this.rooms.get(caseId) ?? []).filter((m) => m.sessionId !== sessionId))
    this.held.set(caseId, (this.held.get(caseId) ?? []).filter((c) => c.sessionId !== sessionId))
    return Promise.resolve()
  }

  members(caseId: string): Promise<StoredMember[]> {
    return Promise.resolve(this.rooms.get(caseId) ?? [])
  }

  /**
   * **First writer wins, unless the holder's session is gone.** Mirrors the
   * store, whose `claim` is a Lua compare-and-set rather than an `HSET`. The
   * property itself is asserted against real Redis in `presence.store.test.ts`
   * - making a fake refuse only asserts the fake - but the fake has to carry
   * the same semantics or every channel-tier test above runs on a store that
   * behaves differently from the one that ships.
   */
  claim(caseId: string, claim: StoredClaim): Promise<void> {
    const rows = this.held.get(caseId) ?? []
    const at = rows.findIndex((c) => c.table === claim.table && c.entryId === claim.entryId)
    if (at >= 0) {
      const holder = rows[at]
      const live = (this.rooms.get(caseId) ?? []).some((m) => m.sessionId === holder?.sessionId)
      if (holder && holder.sessionId !== claim.sessionId && live) return Promise.resolve()
      rows[at] = claim
    } else rows.push(claim)
    this.held.set(caseId, rows)
    return Promise.resolve()
  }

  release(caseId: string, table: string, entryId: string, sessionId: string): Promise<void> {
    this.held.set(
      caseId,
      (this.held.get(caseId) ?? []).filter(
        (c) => !(c.table === table && c.entryId === entryId && c.sessionId === sessionId),
      ),
    )
    return Promise.resolve()
  }

  claims(caseId: string): Promise<StoredClaim[]> {
    return Promise.resolve(this.held.get(caseId) ?? [])
  }

  publish(caseId: string, payload: string): Promise<void> {
    for (const read of this.readers.get(caseId) ?? []) read(payload)
    return Promise.resolve()
  }

  subscribe(caseId: string, listener: (payload: string) => void): Promise<() => void> {
    this.readers.set(caseId, [...(this.readers.get(caseId) ?? []), listener])
    return Promise.resolve(() => {
      this.readers.set(caseId, (this.readers.get(caseId) ?? []).filter((r) => r !== listener))
    })
  }
}

interface Fake extends Member {
  frames: Record<string, unknown>[]
}

/**
 * **`userId` is separable from `username` on purpose.** Deriving it as
 * `u-${username}` made the two keys structurally identical in every test in
 * this file, so a roster keyed on the display name passed the whole suite -
 * which is why the two-analysts-called-Sam defect lived here uncovered. The
 * default keeps the existing cases reading as they did.
 */
function member(caseId: string, username: string, sessionId: string, userId?: string): Fake {
  const frames: Record<string, unknown>[] = []
  return {
    caseId,
    userId: userId ?? `u-${username}`,
    username,
    sessionId,
    joinedAt: Date.now(),
    frames,
    send: (payload) => frames.push(JSON.parse(payload) as Record<string, unknown>),
  }
}

const channelWith = () => new CaseChannel(new FakeStore())

const latest = (who: Fake, type: string) =>
  [...who.frames].reverse().find((frame) => frame['type'] === type)

describe('the roster', () => {
  it('tells everyone already on the case when somebody joins', async () => {
    const channel = channelWith()
    const first = member('C-1', 'Ada', 's1')
    await channel.join(first)
    await channel.join(member('C-1', 'Grace', 's2'))

    expect(latest(first, 'presence')).toMatchObject({
      roster: [{ username: 'Ada' }, { username: 'Grace' }],
    })
  })

  /**
   * **Two tabs are one person in the avatar stack and two writers everywhere
   * else.** Counting connections in the roster is what puts an analyst in
   * their own stack twice - the defect the shared socket exists to avoid - but
   * the count is carried, because "Ada (2)" is useful.
   */
  it('counts one analyst once, however many tabs they have', async () => {
    const channel = channelWith()
    const tab = member('C-1', 'Ada', 's1')
    await channel.join(tab)
    await channel.join(member('C-1', 'Ada', 's2'))

    const presence = latest(tab, 'presence') as { roster: { connections: number }[] }
    expect(presence.roster).toHaveLength(1)
    expect(presence.roster[0]?.connections).toBe(2)
  })

  /**
   * **Two accounts, one display name - the pair this test makes with the one
   * above.** Folding by name gives one participant carrying whichever id
   * arrived first: the second analyst is missing from the avatar stack and the
   * survivor wears their face. The two cases differ only in `userId`, so
   * neither can be satisfied by counting connections alone.
   */
  it('counts two analysts sharing a display name as two people', async () => {
    const channel = channelWith()
    const one = member('C-1', 'Sam', 's1', 'u-sam-1')
    await channel.join(one)
    await channel.join(member('C-1', 'Sam', 's2', 'u-sam-2'))

    const presence = latest(one, 'presence') as {
      roster: { user_id: string; connections: number }[]
    }
    expect(presence.roster).toHaveLength(2)
    expect(presence.roster.map((who) => who.user_id)).toEqual(['u-sam-1', 'u-sam-2'])
    expect(presence.roster.map((who) => who.connections)).toEqual([1, 1])
  })

  it('does not tell a case its neighbour changed', async () => {
    const channel = channelWith()
    const mine = member('C-1', 'Ada', 's1')
    await channel.join(mine)
    const before = mine.frames.length

    await channel.join(member('C-2', 'Grace', 's2'))

    expect(mine.frames).toHaveLength(before)
  })

  it('drops an analyst when their last connection closes', async () => {
    const channel = channelWith()
    const staying = member('C-1', 'Ada', 's1')
    const leaving = member('C-1', 'Grace', 's2')
    await channel.join(staying)
    await channel.join(leaving)

    await channel.leave(leaving)

    expect(latest(staying, 'presence')).toMatchObject({ roster: [{ username: 'Ada' }] })
  })
})

describe('claims', () => {
  it('names the row, the holder and their connection', async () => {
    const channel = channelWith()
    const ada = member('C-1', 'Ada', 's1')
    await channel.join(ada)

    await channel.claim(ada, 'timeline', 't-1')

    expect(latest(ada, 'presence')).toMatchObject({
      claims: [{ table: 'timeline', entry_id: 't-1', username: 'Ada', session_id: 's1' }],
    })
  })

  /**
   * **The id, because the client decides `is this my claim` from this frame.**
   * The store keeps `userId` on a claim for the two-Adas case exactly; drop it
   * from the wire and the only thing a browser can compare against is the
   * display name. Two analysts sharing one then read as each holding the
   * other's rows: the badge that means *somebody else is in here* disappears,
   * on the surface it exists to protect.
   */
  it('names the holder by id, not only by the name shown', async () => {
    const channel = channelWith()
    const ada = member('C-1', 'Ada', 's1')
    await channel.join(ada)

    await channel.claim(ada, 'timeline', 't-1')

    expect(latest(ada, 'presence')).toMatchObject({
      claims: [{ user_id: 'u-Ada' }],
    })
  })

  /**
   * **The property that makes a crashed tab survivable.** A claim lives inside
   * the connection, so a browser that dies must not leave a row looking held
   * for the rest of the session.
   */
  it('releases everything a connection held when it closes', async () => {
    const channel = channelWith()
    const ada = member('C-1', 'Ada', 's1')
    const grace = member('C-1', 'Grace', 's2')
    await channel.join(ada)
    await channel.join(grace)
    await channel.claim(ada, 'timeline', 't-1')
    await channel.claim(ada, 'systems', 'h-9')

    await channel.leave(ada)

    expect(latest(grace, 'presence')).toMatchObject({ claims: [] })
  })

  it('ignores a second claim on a row this connection already holds', async () => {
    const channel = channelWith()
    const ada = member('C-1', 'Ada', 's1')
    await channel.join(ada)
    await channel.claim(ada, 'timeline', 't-1')
    await channel.claim(ada, 'timeline', 't-1')

    const presence = latest(ada, 'presence') as { claims: unknown[] }
    expect(presence.claims).toHaveLength(1)
  })

  it('releases only the row named', async () => {
    const channel = channelWith()
    const ada = member('C-1', 'Ada', 's1')
    await channel.join(ada)
    await channel.claim(ada, 'timeline', 't-1')
    await channel.claim(ada, 'timeline', 't-2')

    await channel.release(ada, 'timeline', 't-1')

    expect(latest(ada, 'presence')).toMatchObject({ claims: [{ entry_id: 't-2' }] })
  })
})

/**
 * **Who counts as "somebody else" - the question a case delete is refused on.**
 * `CasesService.remove` asks this before deleting, so getting it wrong in
 * either direction is visible: too broad and no analyst can ever delete a case
 * they have open, too narrow and one deletes it under another.
 */
describe('the other analysts on a case', () => {
  it('leaves out the analyst asking', async () => {
    const channel = channelWith()
    const ada = member('C-1', 'Ada', 's1')
    await channel.join(ada)

    expect(await channel.othersOn('C-1', ada.userId)).toEqual([])
  })

  /**
   * **Two tabs are one person.** The roster is per connection, so counting
   * rows rather than distinct analysts would refuse every delete made from a
   * case screen - which is every delete.
   */
  it('counts one analyst once however many tabs they have', async () => {
    const channel = channelWith()
    const ada = member('C-1', 'Ada', 's1')
    const adaAgain = member('C-1', 'Ada', 's2')
    await channel.join(ada)
    await channel.join(adaAgain)

    expect(await channel.othersOn('C-1', ada.userId)).toEqual([])
  })

  it('names anybody who is not the analyst asking', async () => {
    const channel = channelWith()
    const ada = member('C-1', 'Ada', 's1')
    const grace = member('C-1', 'Grace', 's2')
    await channel.join(ada)
    await channel.join(grace)

    expect(await channel.othersOn('C-1', ada.userId)).toEqual(['Grace'])
  })

  /** By name, because the refusal is put on screen; the id is internal. */
  it('answers with display names rather than ids', async () => {
    const channel = channelWith()
    const ada = member('C-1', 'Ada', 's1')
    const grace = member('C-1', 'Grace', 's2')
    await channel.join(ada)
    await channel.join(grace)

    const others = await channel.othersOn('C-1', ada.userId)
    expect(others).not.toContain(grace.userId)
  })
})

describe('announcing a write', () => {
  it('tells every screen on the case which tables moved', async () => {
    const channel = channelWith()
    const ada = member('C-1', 'Ada', 's1')
    const grace = member('C-1', 'Grace', 's2')
    await channel.join(ada)
    await channel.join(grace)

    await channel['publishAnnounce']('C-1', ['systems'], 'u-Ada')

    for (const who of [ada, grace]) {
      expect(latest(who, 'case.changed')).toEqual({
        type: 'case.changed',
        scopes: ['systems'],
        by: 'Ada',
      })
    }
  })

  /**
   * **`by` is a name, not an id.** The client puts it on screen; an account id
   * there is an internal identifier shown to an analyst, which is what the
   * fallback below is the exception to.
   */
  it('falls back to the id when the writer has no socket open', async () => {
    const channel = channelWith()
    const ada = member('C-1', 'Ada', 's1')
    await channel.join(ada)

    await channel['publishAnnounce']('C-1', ['timeline'], 'u-NobodyHere')

    expect(latest(ada, 'case.changed')).toMatchObject({ by: 'u-NobodyHere' })
  })

  it('says nothing to a case nobody is watching', async () => {
    const channel = channelWith()
    await expect(channel['publishAnnounce']('C-nobody', ['systems'], 'u-Ada')).resolves.not.toThrow()
  })

  it('keeps going when one socket is dead', async () => {
    const channel = channelWith()
    const dead = member('C-1', 'Dead', 's1')
    dead.send = () => { throw new Error('socket is gone') }
    const alive = member('C-1', 'Alive', 's2')
    await channel.join(dead)
    await channel.join(alive)

    await channel['publishAnnounce']('C-1', ['systems'], 'u-Alive')

    expect(latest(alive, 'case.changed')).toBeDefined()
  })
})

/**
 * Two sockets joining one case in the same tick.
 *
 * **A check-then-await is not a guard.** `join()` tested `unsubscribes.has()`
 * and then awaited `subscribe()`, so two joins in one tick both passed the
 * test, both registered a listener, and the map kept only the second teardown
 * - leaving the first attached for the life of the process and every frame
 * relayed to the room twice, permanently.
 *
 * Found by review rather than by this suite, which awaited each join in turn
 * and so never had two in flight.
 */
describe('two connections arriving together', () => {
  it('subscribes once, and delivers each frame once', async () => {
    const store = new FakeStore()
    const channel = new CaseChannel(store)
    const ada = member('C-1', 'Ada', 's1')
    const grace = member('C-1', 'Grace', 's2')

    // Deliberately started together rather than awaited in turn: that is the race.
    await Promise.all([channel.join(ada), channel.join(grace)])

    ada.frames.length = 0
    await channel['publishAnnounce']('C-1', ['systems'], 'u-Ada')

    expect(ada.frames.filter((frame) => frame['type'] === 'case.changed')).toHaveLength(1)
  })
})

/**
 * A Redis command rejecting must not take the process down.
 *
 * Every announcement is fire-and-forget - the write has already committed and
 * the caller is not waiting - so an unhandled rejection here is the whole
 * server exiting on a blip, under Node's default.
 */
describe('when the store is unwell', () => {
  it('swallows a failed announcement rather than rejecting', async () => {
    const store = new FakeStore()
    store.publish = () => Promise.reject(new Error('redis is away'))
    const channel = new CaseChannel(store)

    expect(() => { channel.announce('C-1', ['systems'], 'u-Ada') }).not.toThrow()
    // Let the rejection settle; an unhandled one fails the run.
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
})
