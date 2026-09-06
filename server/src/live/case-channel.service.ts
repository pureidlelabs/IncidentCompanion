/**
 * Who is on a case, what they are holding, and telling everyone when it moves.
 * The roster and the fan-out live in `presence.store.ts`, so nothing here
 * assumes one process.
 *
 * **A claim is advisory and dies with its connection.** It says "someone is
 * editing this row" so the UI can say so; it is not a lock and protects
 * nothing - the row version does that.
 */
import { Inject, Injectable, Logger } from '@nestjs/common'

import { PresenceStore, type PresenceCoordinator, type StoredMember } from './presence.store.js'

/** One open socket in *this* process. Others exist; Redis is how we know. */
export interface Member extends StoredMember {
  readonly caseId: string
  send(payload: string): void
}

/**
 * The wire shapes, **snake_case on purpose**.
 *
 * These frames reach `caseSocket` raw - `fromWire` never touches them, because
 * they arrive over a socket rather than through `request()`. `Participant` and
 * `Claim` in `ui/src/api/presence.ts` are the contract, and they spell
 * `joined_at`, `last_seen`, `entry_id` and `session_id`.
 */
interface WireParticipant {
  /**
   * **The stable one, and what an avatar URL is built from.** `username` is a
   * display name and `user.name` is not unique - only `email` is - so
   * addressing a picture by name serves two analysts called Sam each other's
   * face. Python keyed avatars by name because its usernames *were* the login;
   * that is not true here, and Python is legacy.
   */
  user_id: string
  username: string
  joined_at: number
  last_seen: number
  connections: number
}

interface WireClaim {
  table: string
  entry_id: string
  /**
   * **What the client compares against to answer *is this mine*.** The store
   * has always kept it; the wire dropped it, leaving the browser to compare
   * display names - and `user.name` is not unique, so two analysts sharing one
   * each read the other's claim as their own and the badge that warns them
   * disappears.
   */
  user_id: string
  username: string
  session_id: string
  taken_at: number
}

@Injectable()
export class CaseChannel {
  private readonly log = new Logger(CaseChannel.name)

  /** Sockets held by this process, and the subscription feeding them. */
  private readonly local = new Map<string, Set<Member>>()
  /**
   * **The promise, not the resolved teardown.** `has()` then `await
   * subscribe()` is a check across a yield: two joins in one tick both pass
   * it, both register a listener, and only the second teardown is kept - so
   * the first stays attached and every frame reaches the room twice, for the
   * life of the process. Storing the in-flight promise closes the window
   * without a lock, because the `set` happens before any await.
   */
  private readonly subscriptions = new Map<string, Promise<() => void>>()

  /**
   * **The token is the class; the type is the interface.** An interface has no
   * runtime value, so Nest cannot resolve a parameter typed only as one - it
   * reports *"can't resolve dependencies of the CaseChannel (?)"*, which reads
   * as a missing provider rather than as a type that does not exist at run
   * time. Naming the class in `@Inject` keeps the container working while the
   * *declared dependency* stays the eight methods this class actually uses,
   * which is what lets a test fake be checked rather than cast.
   */
  constructor(@Inject(PresenceStore) private readonly store: PresenceCoordinator) {}

  async join(member: Member): Promise<void> {
    const room = this.local.get(member.caseId) ?? new Set<Member>()
    room.add(member)
    this.local.set(member.caseId, room)

    // Once per case per process: every frame published anywhere arrives here
    // and is relayed to the sockets this process holds.
    let subscribed = this.subscriptions.get(member.caseId)
    if (!subscribed) {
      subscribed = this.store.subscribe(member.caseId, (payload) => {
        this.relay(member.caseId, payload)
      })
      this.subscriptions.set(member.caseId, subscribed)
    }
    await subscribed

    await this.store.join(member.caseId, member)
    await this.announcePresence(member.caseId)
  }

  async leave(member: Member): Promise<void> {
    const room = this.local.get(member.caseId)
    room?.delete(member)
    if (room && room.size === 0) {
      this.local.delete(member.caseId)
      const subscribed = this.subscriptions.get(member.caseId)
      this.subscriptions.delete(member.caseId)
      if (subscribed) (await subscribed)()
    }

    await this.store.leave(member.caseId, member.sessionId)
    await this.announcePresence(member.caseId)
  }

  async claim(member: Member, table: string, entryId: string): Promise<void> {
    await this.store.claim(member.caseId, {
      table,
      entryId,
      userId: member.userId,
      username: member.username,
      sessionId: member.sessionId,
      takenAt: Date.now(),
    })
    await this.announcePresence(member.caseId)
  }

  /**
   * Who holds this row, if anyone - for the write path rather than the screen.
   *
   * **A claim is advisory until something reads it before writing.** The
   * pencil being disabled is a property of one browser; this is what makes
   * "checked out" true of the API as well.
   */
  async holderOf(
    caseId: string,
    table: string,
    entryId: string,
  ): Promise<{ userId: string; username: string } | null> {
    const held = await this.store.claims(caseId)
    const one = held.find((claim) => claim.table === table && claim.entryId === entryId)
    return one ? { userId: one.userId, username: one.username } : null
  }

  /**
   * The other analysts on this case, by display name.
   *
   * **By `userId`, so a second tab is not a second person.** The roster is per
   * connection; comparing display names would also make two analysts sharing a
   * first name invisible to each other.
   */
  async othersOn(caseId: string, exceptUserId: string): Promise<string[]> {
    const members = await this.store.members(caseId)
    const names = new Set<string>()
    for (const member of members) {
      if (member.userId !== exceptUserId) names.add(member.username)
    }
    return [...names]
  }

  async release(member: Member, table: string, entryId: string): Promise<void> {
    await this.store.release(member.caseId, table, entryId, member.sessionId)
    await this.announcePresence(member.caseId)
  }

  /**
   * A write landed: tell every screen open on this case which tables moved.
   *
   * **The writer is told too.** Telling them apart means identifying a *tab*,
   * and two tabs of one analyst are two writers. One redundant refetch of data
   * that is already fresh is the cost the client documents as accepted.
   *
   * **`by` is a name, not an id.** The client puts it on screen, and an
   * account id there is an internal identifier shown to an analyst.
   *
   * **`scopes` is `string[]` and deliberately not the `Scope` union.** The
   * socket is transport: `architecture.test.ts` forbids `live` importing
   * `domain`, because the channel knows about delivery and nothing about what
   * a scope means. The vocabulary is enforced at the callers, which own it.
   */
  announce(caseId: string, scopes: readonly string[], actorId: string): void {
    /**
     * **Nothing here may reach the caller, synchronously or otherwise.** The
     * write has already committed: an unhandled rejection exits the process on
     * a Redis blip, and a thrown one turns a 200 into a 500 for a row that is
     * already saved. A missed repaint is the right failure - the next read
     * corrects it. -> `test/degradation`
     */
    try {
      this.publishAnnounce(caseId, scopes, actorId).catch((error: unknown) => {
        this.log.warn(`could not announce a write on ${caseId}: ${String(error)}`)
      })
    } catch (error) {
      this.log.warn(`could not announce a write on ${caseId}: ${String(error)}`)
    }
  }

  private async publishAnnounce(
    caseId: string,
    scopes: readonly string[],
    actorId: string,
  ): Promise<void> {
    const members = await this.store.members(caseId)
    const by = members.find((one) => one.userId === actorId)?.username ?? actorId
    await this.store.publish(caseId, JSON.stringify({ type: 'case.changed', scopes, by }))
  }

  private async announcePresence(caseId: string): Promise<void> {
    const [members, claims] = await Promise.all([
      this.store.members(caseId),
      this.store.claims(caseId),
    ])

    // **The roster is per analyst, the claims are per connection.** Two tabs
    // are one person in the avatar stack and two writers everywhere else.
    //
    // **Keyed by `userId`, never by the name shown.** `user.name` is not
    // unique, so a map on it folds two analysts called Sam into one
    // participant with `connections: 2` wearing whichever id arrived first -
    // the second is absent from the avatar stack and the survivor carries
    // their face. `othersOn` and `StoredClaim.userId` were both settled on
    // this and this site was missed.
    const byAnalyst = new Map<string, WireParticipant>()
    for (const member of members) {
      const seen = byAnalyst.get(member.userId)
      if (seen) {
        seen.connections += 1
        seen.joined_at = Math.min(seen.joined_at, member.joinedAt)
      } else {
        byAnalyst.set(member.userId, {
          user_id: member.userId,
          username: member.username,
          joined_at: member.joinedAt,
          last_seen: Date.now(),
          connections: 1,
        })
      }
    }

    await this.store.publish(
      caseId,
      JSON.stringify({
        type: 'presence',
        roster: [...byAnalyst.values()],
        claims: claims.map((claim): WireClaim => ({
          table: claim.table,
          entry_id: claim.entryId,
          user_id: claim.userId,
          username: claim.username,
          session_id: claim.sessionId,
          taken_at: claim.takenAt,
        })),
      }),
    )
  }

  /**
   * Send a prose frame to everyone on the case except the connection it came
   * from.
   *
   * Published through the store rather than delivered locally, so the sockets
   * a second instance holds get it too.
   */
  prose(caseId: string, payload: Record<string, unknown>, fromSessionId: string): void {
    this.store
      .publish(caseId, JSON.stringify({ ...payload, from: fromSessionId }))
      .catch((error: unknown) => {
        this.log.warn(`could not relay prose on ${caseId}: ${String(error)}`)
      })
  }

  /** Deliver one published frame to the sockets this process holds. */
  private relay(caseId: string, payload: string): void {
    // **Parsed once for the whole room, not per member.** Every frame carries
    // this check now, so doing it inside the loop would parse the same JSON
    // once per open socket on the case.
    let from: unknown
    try {
      from = (JSON.parse(payload) as { from?: unknown }).from
    } catch {
      from = undefined
    }

    for (const member of this.local.get(caseId) ?? []) {
      // The connection that sent a prose frame has already applied it.
      if (typeof from === 'string' && from === member.sessionId) continue
      try {
        member.send(payload)
      } catch (error) {
        // One dead socket must not stop the rest of the room being told.
        this.log.warn(`dropping a frame for ${member.username}: ${String(error)}`)
      }
    }
  }
}
