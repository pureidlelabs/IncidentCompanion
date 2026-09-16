/**
 * Which customers an analyst reaches, and at what level.
 *
 * **The resolution, never its enforcement.** This answers what somebody may
 * do; asking before writing is the caller's, and keeping the two apart is what
 * lets one implementation serve every write path rather than each growing its
 * own idea of the rules.
 *
 * **Answered per call, from the grants as they stand.** A level reduced or a
 * group revoked has to take effect for a session already open, so a cache here
 * would be the thing that made those two scenarios false - there is nowhere
 * for a stale answer to live.
 */
import { Inject, Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'

import { ADMIN_ROLE } from '../domain/analyst-account.js'
import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { user } from '../db/schema/auth.js'
import { customers } from '../db/schema/customer.js'
import { LEVELS, groupCustomers, groupMembers, groups } from '../db/schema/groups.js'

export type Level = 'read' | 'write' | 'delete'

/**
 * Ordered weakest to strongest, which is the whole of *most permissive
 * applies*: comparing by position is the comparison.
 *
 * The schema's vocabulary, so a level added to the specification is added
 * once. Its declaration order is what ranks the levels. -> `LEVELS`
 */
export const RANK: readonly Level[] = LEVELS

const strongest = (levels: readonly Level[]): Level | null =>
  levels.length === 0 ? null : RANK[Math.max(...levels.map((one) => RANK.indexOf(one)))]!

/**
 * The level one account settles at over one customer: every grant that reaches
 * it, and the floor where one applies, resolved by *most permissive*.
 *
 * `null` where nothing grants and no floor applies, which is no reach at all
 * rather than the weakest level.
 */
const settle = (rows: readonly { level: Level }[], floor?: Level): Level | null =>
  strongest([...(floor ? [floor] : []), ...rows.map((one) => one.level)])

/** The rows of one join, in first-appearance order, keyed by whose they are. */
function grouped<Row>(rows: readonly Row[], key: (row: Row) => string): Map<string, Row[]> {
  const byKey = new Map<string, Row[]>()
  for (const row of rows) {
    const held = byKey.get(key(row))
    if (held) held.push(row)
    else byKey.set(key(row), [row])
  }
  return byKey
}

/**
 * What the install itself holds over the default customer, by role.
 *
 * **A floor, not a ceiling.** It guarantees a minimum and says nothing against
 * a group granting more; reading it as a cap would mean a group could not give
 * anybody delete on an unattributed case.
 *
 * **An administrator reaches delete so that an install can dispose of a case
 * nobody has attributed** without first building the access model to get at a
 * case nobody owns.
 *
 * Not a grant to somebody's data: the default holds only incidents whose
 * origin is not yet known, and the role reaches no further than it.
 */
const overTheDefault = (role: string | null): Level =>
  role === ADMIN_ROLE ? 'delete' : 'write'


/**
 * Why somebody reaches a customer: a group that holds it, or the floor.
 *
 * **The floor is not a grant.** Every analyst reaches the default customer by
 * role, so attributing it to a group would send an administrator looking for
 * one to revoke that nobody made.
 */
export type Granted = { by: 'group'; groupId: string; groupName: string } | { by: 'default' }

/** One customer an account reaches, and why. */
export interface ReachedCustomer {
  customerId: string
  customerName: string
  level: Level
  granted: Granted
}

/** One analyst who reaches a customer, and why. */
export interface ReachingAnalyst {
  userId: string
  username: string
  displayName: string
  level: Level
  granted: Granted
}

/**
 * The grant that decided a level, from the rows that produced it.
 *
 * **The strongest one, because that is the level.** Naming any other grant
 * tells an administrator to revoke something that would change nothing.
 */
function decidedBy(
  rows: readonly { level: Level; groupId: string; groupName: string }[],
  level: Level,
  /**
   * What the role alone already grants here, where anything does.
   *
   * **A group granting no more than the floor did not grant the reach.**
   * Naming it sends an administrator to revoke a grant, watch the reach stay
   * exactly as it was, and conclude the screen is lying to them. Only a group
   * that raises the level above the floor is what to revoke.
   */
  floor?: Level,
): Granted {
  if (floor !== undefined && strongest([floor, level]) === floor) return { by: 'default' }
  const winner = rows.find((row) => row.level === level)
  return winner
    ? { by: 'group', groupId: winner.groupId, groupName: winner.groupName }
    : { by: 'default' }
}

@Injectable()
export class ReachService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async defaultCustomerId(): Promise<string | null> {
    const [row] = await this.db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.isDefault, true))
      .limit(1)
    return row?.id ?? null
  }

  /**
   * **The default customer's guarantee joins the grants rather than replacing
   * them**, so the same *most permissive* rule settles both: a group holding
   * the default may raise an analyst above the floor, and a membership weaker
   * than the floor does not lower them below it. -> `overTheDefault`
   *
   * The groups are read either way. Answering the default before consulting
   * them would cap it, which is the reading the specification does not
   * support and which would mean nobody could ever be given delete on an
   * unattributed case.
   */
  async levelFor(userId: string, customerId: string): Promise<Level | null> {
    const held = await this.db
      .select({ level: groupMembers.level })
      .from(groupMembers)
      .innerJoin(groupCustomers, eq(groupCustomers.groupId, groupMembers.groupId))
      .where(and(eq(groupMembers.userId, userId), eq(groupCustomers.customerId, customerId)))

    if (customerId !== (await this.defaultCustomerId())) return settle(held)

    // The role is read here rather than taken from a caller: this is the one
    // place reach is resolved, and a caller that supplied it could supply a
    // different one to the socket than to the guard.
    const [account] = await this.db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, userId))
    return settle(held, overTheDefault(account?.role ?? null))
  }


  /**
   * Every customer this account reaches, with the level and what granted it.
   *
   * **The question an administrator asks after granting**, which the reach
   * model could answer and nothing exposed. Resolved here rather than in a
   * controller so it obeys the same *most permissive applies* rule every other
   * reader does.
   */
  async reachOf(userId: string): Promise<ReachedCustomer[] | null> {
    const rows = await this.db
      .select({
        customerId: groupCustomers.customerId,
        customerName: customers.name,
        level: groupMembers.level,
        groupId: groups.id,
        groupName: groups.name,
      })
      .from(groupMembers)
      .innerJoin(groupCustomers, eq(groupCustomers.groupId, groupMembers.groupId))
      .innerJoin(groups, eq(groups.id, groupMembers.groupId))
      .innerJoin(customers, eq(customers.id, groupCustomers.customerId))
      .where(eq(groupMembers.userId, userId))

    const [account] = await this.db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, userId))
    // No row is nobody holding this id, which an empty reach cannot say.
    if (!account) return null
    const fallback = await this.defaultCustomerId()

    const byCustomer = new Map<string, ReachedCustomer>()
    for (const [customerId, forThis] of grouped(rows, (one) => one.customerId)) {
      const floor = customerId === fallback ? overTheDefault(account.role ?? null) : undefined
      const level = settle(forThis, floor)
      if (!level) continue
      byCustomer.set(customerId, {
        customerId,
        customerName: forThis[0]!.customerName,
        level,
        granted: decidedBy(forThis, level, floor),
      })
    }

    // **The default is reached whether or not a group names it.** An analyst in
    // no group reaches it and nothing else, which is the answer an
    // administrator needs when they ask why somebody sees an unattributed case.
    if (fallback && !byCustomer.has(fallback)) {
      const [row] = await this.db
        .select({ name: customers.name })
        .from(customers)
        .where(eq(customers.id, fallback))
      byCustomer.set(fallback, {
        customerId: fallback,
        customerName: row?.name ?? '',
        level: overTheDefault(account.role ?? null),
        granted: { by: 'default' },
      })
    }

    return [...byCustomer.values()]
  }

  /**
   * Every analyst who reaches this customer, with the level and what granted it.
   *
   * The same question from the other end, which the requirement asks for by
   * name: *the same MUST be answerable from the other end -- for a customer,
   * who reaches it and how*.
   */
  async reachTo(customerId: string): Promise<ReachingAnalyst[] | null> {
    // The same, from the row rather than from the reach.
    const [held] = await this.db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.id, customerId))
    if (!held) return null

    const rows = await this.db
      .select({
        userId: groupMembers.userId,
        username: user.email,
        displayName: user.name,
        level: groupMembers.level,
        groupId: groups.id,
        groupName: groups.name,
      })
      .from(groupMembers)
      .innerJoin(groupCustomers, eq(groupCustomers.groupId, groupMembers.groupId))
      .innerJoin(groups, eq(groups.id, groupMembers.groupId))
      .innerJoin(user, eq(user.id, groupMembers.userId))
      .where(eq(groupCustomers.customerId, customerId))

    const fallback = await this.defaultCustomerId()
    const byUser = new Map<string, ReachingAnalyst>()

    if (customerId === fallback) {
      // Every account reaches the default, so the answer starts from the roster
      // rather than from the groups.
      const everybody = await this.db
        .select({ userId: user.id, username: user.email, displayName: user.name, role: user.role })
        .from(user)
      for (const who of everybody) {
        byUser.set(who.userId, {
          userId: who.userId,
          username: who.username,
          displayName: who.displayName,
          level: overTheDefault(who.role),
          granted: { by: 'default' },
        })
      }
    }

    for (const [userId, forThem] of grouped(rows, (one) => one.userId)) {
      const floor = byUser.get(userId)?.level
      const level = settle(forThem, floor)
      if (!level) continue
      byUser.set(userId, {
        userId,
        username: forThem[0]!.username,
        displayName: forThem[0]!.displayName,
        level,
        granted: decidedBy(forThem, level, floor),
      })
    }

    return [...byUser.values()]
  }

  /**
   * The default is included whether or not any group names it, because
   * reaching it was never a membership.
   */
  async customersReachedBy(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ customerId: groupCustomers.customerId })
      .from(groupMembers)
      .innerJoin(groupCustomers, eq(groupCustomers.groupId, groupMembers.groupId))
      .where(eq(groupMembers.userId, userId))

    const reached = new Set(rows.map((row) => row.customerId))
    const fallback = await this.defaultCustomerId()
    if (fallback) reached.add(fallback)
    return [...reached]
  }
}
