/**
 * Presence, claims and socket fan-out in Redis: rooms, connections and claims
 * on **TTL as the heartbeat**, fan-out on pub/sub.
 *
 * **Two connections, because a subscribed client refuses ordinary commands.**
 * Sharing one surfaces as every write silently failing from the moment the
 * first socket opens.
 */
import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Redis } from 'ioredis'

import type { Env } from '../config/env.js'

/** Long enough to survive a slow tick, short enough that a crash clears fast. */
const MEMBER_TTL_SECONDS = 30
const HEARTBEAT_MS = 10_000

export interface StoredMember {
  readonly sessionId: string
  readonly userId: string
  readonly username: string
  readonly joinedAt: number
}

export interface StoredClaim {
  readonly table: string
  readonly entryId: string
  /**
   * **Who holds it, by id.** The write path refuses a patch to a row another
   * analyst has open, and identity there cannot be the display name: Better
   * Auth's `name` is not unique, so two analysts called "Sam" would each be
   * treated as holding the other's claim. `username` stays because the claim
   * is also put on screen, and an account id shown to an analyst is an
   * internal identifier leaking into the interface.
   */
  readonly userId: string
  readonly username: string
  readonly sessionId: string
  readonly takenAt: number
}

/**
 * Take a claim field unless a *live* session already holds it. Returns 1 when
 * the caller now holds it, 0 when somebody else does.
 *
 * `KEYS[1]` is the claims hash; the member key is built inside the script from
 * `ARGV[4]`, because the session whose liveness decides the answer is known
 * only after reading the field. **That undeclared key assumes a standalone
 * server** - under a cluster the claims hash and the member keys would have to
 * share a slot.
 */
const CLAIM_SCRIPT = `
local existing = redis.call('HGET', KEYS[1], ARGV[1])
if existing then
  local holder = cjson.decode(existing)['sessionId']
  if holder ~= ARGV[5] and redis.call('EXISTS', ARGV[4] .. holder) == 1 then
    return 0
  end
end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
redis.call('HEXPIRE', KEYS[1], ARGV[3], 'FIELDS', 1, ARGV[1])
return 1
`

const memberKey = (caseId: string, sessionId: string) => `case:${caseId}:member:${sessionId}`
const membersKey = (caseId: string) => `case:${caseId}:members`
const claimsKey = (caseId: string) => `case:${caseId}:claims`
const channelFor = (caseId: string) => `case:${caseId}:events`

/**
 * What a case channel needs from the store, and nothing else - declared so a
 * stand-in can be type-checked against it, which `PresenceStore` itself cannot
 * be: a class with private members is satisfied only by inheritance.
 *
 * Exactly what `CaseChannel` calls. Publishing the whole class as an interface
 * would describe the implementation and drag the private half back in.
 */
export interface PresenceCoordinator {
  join(caseId: string, member: StoredMember): Promise<void>
  leave(caseId: string, sessionId: string): Promise<void>
  members(caseId: string): Promise<StoredMember[]>
  claim(caseId: string, claim: StoredClaim): Promise<void>
  release(caseId: string, table: string, entryId: string, sessionId: string): Promise<void>
  claims(caseId: string): Promise<StoredClaim[]>
  publish(caseId: string, payload: string): Promise<void>
  subscribe(caseId: string, listener: (payload: string) => void): Promise<() => void>
}

@Injectable()
export class PresenceStore implements PresenceCoordinator, OnApplicationShutdown {
  private readonly log = new Logger(PresenceStore.name)

  /**
   * Commands issued and not yet answered.
   *
   * **So shutdown can wait for them rather than cutting them off.** A
   * closing socket announces a departure *after* the socket is gone, and
   * closing the client under that pending command rejects it with
   * `Connection is closed` - unhandled, because the caller deliberately
   * does not await the fan-out.
   */
  private readonly inFlight = new Set<Promise<unknown>>()
  private readonly commands: Redis
  private readonly reader: Redis
  private readonly listeners = new Map<string, Set<(payload: string) => void>>()
  /**
   * Keyed by case *and* session. A session id is `pid-counter` and one
   * connection belongs to one case, so the id alone is unique today - and a
   * `leave` that cleared another case's heartbeat would do it silently, which
   * is not a risk worth carrying for a shorter key.
   */
  private readonly beats = new Map<string, ReturnType<typeof setInterval>>()

  /**
   * `caseId:sessionId` -> the claim fields this connection holds.
   *
   * **In this process and deliberately nowhere else.** If the process dies
   * this map dies with it, nothing refreshes those fields, and they expire -
   * which is the whole mechanism. Keeping it in Redis would make a crashed
   * process's claims immortal, the failure this replaces.
   */
  private readonly holdings = new Map<string, Set<string>>()

  constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    const url = config.get('REDIS_URL', { infer: true })
    this.commands = new Redis(url)
    this.reader = new Redis(url)

    this.reader.on('message', (channel: string, payload: string) => {
      for (const listen of this.listeners.get(channel) ?? []) listen(payload)
    })
    for (const client of [this.commands, this.reader]) {
      client.on('error', (error: Error) => { this.log.warn(`redis: ${error.message}`) })
    }
  }

  /** Register a connection and keep its key alive while the socket is open. */
  async join(caseId: string, member: StoredMember): Promise<void> {
    await this.commands
      .multi()
      .set(memberKey(caseId, member.sessionId), JSON.stringify(member), 'EX', MEMBER_TTL_SECONDS)
      .sadd(membersKey(caseId), member.sessionId)
      .exec()

    this.beats.set(
      `${caseId}:${member.sessionId}`,
      setInterval(() => {
        // **Caught, and it fires every ten seconds per connection.** Nothing
        // awaits a heartbeat, so one rejected `EXPIRE` during a Redis blip is
        // an unhandled rejection and, under Node's default, the process. The
        // right failure is a member key that lapses and a roster that corrects
        // itself on the next read.
        this.touch(caseId, member.sessionId)
          .catch((error: unknown) => {
            this.log.warn(`heartbeat failed for ${member.sessionId}: ${String(error)}`)
          })
      }, HEARTBEAT_MS),
    )
  }

  async leave(caseId: string, sessionId: string): Promise<void> {
    const beat = this.beats.get(`${caseId}:${sessionId}`)
    if (beat) clearInterval(beat)
    this.beats.delete(`${caseId}:${sessionId}`)
    // Beside `beats`, and for the same reason: both are keyed per connection
    // and neither outlives one. Leaving it retains a Set of claim fields per
    // `(case, session)` that has ever connected, for the life of the process.
    this.holdings.delete(`${caseId}:${sessionId}`)

    const claims = await this.claims(caseId)
    const mine = claims.filter((claim) => claim.sessionId === sessionId)

    const tx = this.commands
      .multi()
      .del(memberKey(caseId, sessionId))
      .srem(membersKey(caseId), sessionId)
    for (const claim of mine) tx.hdel(claimsKey(caseId), `${claim.table}:${claim.entryId}`)
    await tx.exec()
  }

  /**
   * The roster, **with expired members swept as they are read**.
   *
   * A key that has expired leaves its id in the set, so the set is corrected
   * here rather than by a sweeper: the read is the only moment anyone cares,
   * and a background job would be a second thing to keep running.
   */
  async members(caseId: string): Promise<StoredMember[]> {
    const ids = await this.commands.smembers(membersKey(caseId))
    if (ids.length === 0) return []

    const raw = await this.commands.mget(ids.map((id) => memberKey(caseId, id)))
    const alive: StoredMember[] = []
    const dead: string[] = []

    ids.forEach((id, at) => {
      const value = raw[at]
      if (value) alive.push(JSON.parse(value) as StoredMember)
      else dead.push(id)
    })
    if (dead.length > 0) await this.commands.srem(membersKey(caseId), ...dead)
    return alive
  }

  /**
   * Take a row: **first writer wins, and only if nobody live holds it.** A
   * dead holder's claim is takeable, decided by whether their member key still
   * exists, so a `kill -9` does not lock the row until somebody reads the
   * case.
   *
   * One `EVAL`, never `HSETNX` plus a read: the takeover branch is itself a
   * check-then-write. The script decides and calls `HEXPIRE` in one step.
   */
  async claim(caseId: string, claim: StoredClaim): Promise<void> {
    const field = `${claim.table}:${claim.entryId}`
    const took = await this.commands.eval(
      CLAIM_SCRIPT,
      1,
      claimsKey(caseId),
      field,
      JSON.stringify(claim),
      String(MEMBER_TTL_SECONDS),
      `case:${caseId}:member:`,
      claim.sessionId,
    )
    // **Only what we actually hold**, or the heartbeat refreshes the other
    // analyst's field and `leave` deletes their claim on our disconnect.
    if (took === 1) this.held(caseId, claim.sessionId).add(field)
  }

  /**
   * The fields this connection holds, **in this process and nowhere else.**
   *
   * Deliberately not in Redis: if the process dies, this set dies with it,
   * nothing refreshes those fields, and they expire. Storing it centrally
   * would make a crashed process's claims immortal, which is the failure being
   * removed.
   */
  private held(caseId: string, sessionId: string): Set<string> {
    const key = `${caseId}:${sessionId}`
    const existing = this.holdings.get(key)
    if (existing) return existing
    const fresh = new Set<string>()
    this.holdings.set(key, fresh)
    return fresh
  }

  /**
   * Refresh everything this connection holds - the member key and its claims.
   *
   * **A named method because the interval cannot be tested and this can.** The
   * property that matters is that a claim's expiry moves while its analyst is
   * connected; asserting it through a timer means waiting out a real TTL.
   */
  async touch(caseId: string, sessionId: string): Promise<void> {
    const fields = [...this.held(caseId, sessionId)]
    const tx = this.commands.multi().expire(memberKey(caseId, sessionId), MEMBER_TTL_SECONDS)
    if (fields.length > 0) {
      tx.call(
        'HEXPIRE',
        claimsKey(caseId),
        String(MEMBER_TTL_SECONDS),
        'FIELDS',
        String(fields.length),
        ...fields,
      )
    }
    await tx.exec()
  }

  async release(caseId: string, table: string, entryId: string, sessionId: string): Promise<void> {
    const field = `${table}:${entryId}`
    const held = await this.commands.hget(claimsKey(caseId), field)
    if (!held) return
    // **Only the holder may release.** Otherwise a second analyst opening the
    // same row and closing it takes the claim off the person still editing.
    if ((JSON.parse(held) as StoredClaim).sessionId !== sessionId) return
    await this.commands.hdel(claimsKey(caseId), field)
    // Or the heartbeat goes on refreshing a field nobody holds - harmless
    // while the field is gone, and wrong the moment somebody else takes it.
    this.held(caseId, sessionId).delete(field)
  }

  /**
   * The claims held on this case, swept of the ones whose session is gone.
   *
   * Sweeps against the live roster rather than an expiry, per claim rather
   * than per case - recovering from one crash must not unlock the row a
   * surviving analyst is editing - and **deletes** the stranded field rather
   * than filtering it, or the hash grows for the life of the case.
   */
  async claims(caseId: string): Promise<StoredClaim[]> {
    const held = await this.commands.hgetall(claimsKey(caseId))
    const alive = new Set((await this.members(caseId)).map((one) => one.sessionId))

    const kept: StoredClaim[] = []
    const stranded: string[] = []
    for (const [field, value] of Object.entries(held)) {
      const claim = JSON.parse(value) as StoredClaim
      if (alive.has(claim.sessionId)) kept.push(claim)
      else stranded.push(field)
    }
    if (stranded.length > 0) await this.commands.hdel(claimsKey(caseId), ...stranded)
    return kept
  }

  /** Fan a frame out to every process holding sockets on this case. */
  async publish(caseId: string, payload: string): Promise<void> {
    await this.tracked(this.commands.publish(channelFor(caseId), payload))
  }

  async subscribe(caseId: string, listener: (payload: string) => void): Promise<() => void> {
    const channel = channelFor(caseId)
    const room = this.listeners.get(channel) ?? new Set<(payload: string) => void>()
    if (room.size === 0) await this.reader.subscribe(channel)
    room.add(listener)
    this.listeners.set(channel, room)

    return () => {
      room.delete(listener)
      if (room.size === 0) {
        this.listeners.delete(channel)
        this.reader.unsubscribe(channel).catch((error: unknown) => {
          this.log.warn(`could not unsubscribe from ${channel}: ${String(error)}`)
        })
      }
    }
  }

  /**
   * Runs a command, and remembers it until it answers.
   *
   * **Wrapped rather than awaited by the caller.** The point of the fan-out is
   * that nobody waits for it; this keeps that true while still giving shutdown
   * something to wait on.
   */
  private tracked<T>(work: Promise<T>): Promise<T> {
    this.inFlight.add(work)
    const done = (): void => {
      this.inFlight.delete(work)
    }
    work.then(done, done)
    return work
  }

  async onApplicationShutdown(): Promise<void> {
    for (const beat of this.beats.values()) clearInterval(beat)
    this.beats.clear()

    /**
     * **Drained before the connections go, or the pending commands reject.**
     * `allSettled`, because a command that was already failing must not stop
     * the shutdown - the point is to let it finish, not to require that it
     * succeeded. This settles immediately when nothing is in flight.
     */
    await Promise.allSettled([...this.inFlight])

    await Promise.allSettled([this.commands.quit(), this.reader.quit()])
  }
}
