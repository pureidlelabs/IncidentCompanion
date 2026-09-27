/**
 * Which customers an analyst reaches, and at what level.
 *
 * **The level is the store's answer, never this module's.** `levelOnCase`
 * asks `ic_reach`, and `reachOf` and `reachTo` take the level and the role's
 * floor from `ic_level` and `ic_floor` -- the functions the row-level policies
 * ask -- so the guard, the socket, the store and what an administrator is shown
 * cannot disagree. Only the grant naming a level is worked out here.
 *
 * **Answered per call, from the grants as they stand.** A level reduced or a
 * group revoked has to take effect for a session already open, so a cache here
 * would be the thing that made those two scenarios false - there is nowhere
 * for a stale answer to live.
 */
import { Inject, Injectable } from '@nestjs/common'
import { eq, sql, type SQL } from 'drizzle-orm'

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
   * What the role alone grants here, where anything does. Never above `level`.
   *
   * **A group granting no more than the floor did not grant the reach.**
   * Naming it sends an administrator to revoke a grant, watch the reach stay
   * exactly as it was, and conclude the screen is lying to them. Only a group
   * that raises the level above the floor is what to revoke.
   */
  floor?: Level,
): Granted {
  if (floor === level) return { by: 'default' }
  const winner = rows.find((row) => row.level === level)
  return winner
    ? { by: 'group', groupId: winner.groupId, groupName: winner.groupName }
    : { by: 'default' }
}

@Injectable()
export class ReachService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Whether `caseId` names a case, whose it is, and the level `userId` holds
   * over it: null where there is no such case.
   *
   * **One statement whichever the answer**, so a case out of reach costs what
   * an absent one does.
   */
  async levelOnCase(
    userId: string,
    caseId: string,
  ): Promise<{ customerId: string | null; level: Level | null } | null> {
    const { rows } = await this.db.execute<{
      present: boolean
      customer: string | null
      level: Level | null
    }>(sql`select present, customer, level from ic_reach(${userId}, ${caseId}::uuid)`)
    const [reached] = rows
    return reached?.present ? { customerId: reached.customer, level: reached.level } : null
  }

  /** Every group grant matching `where`, with the group that makes it. */
  private grants(where: SQL) {
    return this.db
      .select({
        userId: groupMembers.userId,
        customerId: groupCustomers.customerId,
        level: groupMembers.level,
        groupId: groups.id,
        groupName: groups.name,
      })
      .from(groupMembers)
      .innerJoin(groupCustomers, eq(groupCustomers.groupId, groupMembers.groupId))
      .innerJoin(groups, eq(groups.id, groupMembers.groupId))
      .where(where)
  }

  /**
   * Every customer this account reaches, with the level and what granted it.
   *
   * **The question an administrator asks after granting**, which the reach
   * model could answer and nothing exposed. Null where no account holds the id.
   */
  async reachOf(userId: string): Promise<ReachedCustomer[] | null> {
    const [account] = await this.db.select({ id: user.id }).from(user).where(eq(user.id, userId))
    if (!account) return null

    const { rows } = await this.db.execute<{
      customerId: string
      customerName: string
      level: Level | null
      floor: Level | null
    }>(sql`
      select c.id as "customerId", c.name as "customerName",
             ic_level(${userId}, c.id) as level, ic_floor(${userId}, c.id) as floor
        from customers c
       order by c.is_default, c.name`)
    const byCustomer = grouped(
      await this.grants(eq(groupMembers.userId, userId)),
      (one) => one.customerId,
    )
    return rows.flatMap(({ customerId, customerName, level, floor }) =>
      level
        ? [
            {
              customerId,
              customerName,
              level,
              granted: decidedBy(byCustomer.get(customerId) ?? [], level, floor ?? undefined),
            },
          ]
        : [],
    )
  }

  /**
   * Every analyst who reaches this customer, with the level and what granted it.
   *
   * The same question from the other end, which the requirement asks for by
   * name: *the same MUST be answerable from the other end -- for a customer,
   * who reaches it and how*. Null where no customer holds the id.
   */
  async reachTo(customerId: string): Promise<ReachingAnalyst[] | null> {
    const [held] = await this.db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.id, customerId))
    if (!held) return null

    const { rows } = await this.db.execute<{
      userId: string
      username: string
      displayName: string
      level: Level | null
      floor: Level | null
    }>(sql`
      select u.id as "userId", u.email as username, u.name as "displayName",
             ic_level(u.id, ${customerId}::uuid) as level, ic_floor(u.id, ${customerId}::uuid) as floor
        from "user" u
       order by u.email`)
    const byUser = grouped(
      await this.grants(eq(groupCustomers.customerId, customerId)),
      (one) => one.userId,
    )
    return rows.flatMap(({ userId, username, displayName, level, floor }) =>
      level
        ? [
            {
              userId,
              username,
              displayName,
              level,
              granted: decidedBy(byUser.get(userId) ?? [], level, floor ?? undefined),
            },
          ]
        : [],
    )
  }
}
