/**
 * Granting and revoking what an analyst reaches: groups, the customers they
 * hold, and who is in them at what level.
 *
 * **One membership at a time**, which the specification asks for by name, and
 * every act that alters reach announces the analyst it altered.
 *
 * The announcement carries who rather than what. A membership revoked, a level
 * reduced and a customer leaving a group all change one thing - what that
 * analyst reaches - and the listener's answer is the same each time: make them
 * ask again. Working out which of somebody's open cases survived the change
 * would be a second copy of the reach rules, kept in step by hand.
 * -> `reach-changed.ts`
 */
import { Inject, Injectable } from '@nestjs/common'
import { and, eq, ne } from 'drizzle-orm'

import { DATABASE } from '../db/db.module.js'
import { user } from '../db/schema/auth.js'
import { customers } from '../db/schema/customer.js'
import type { Database } from '../db/client.js'
import { groupCustomers, groupMembers, groups } from '../db/schema/groups.js'
import { reachChanged } from './reach-changed.js'
import type { Level } from './reach.service.js'

@Injectable()
export class GroupsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async all(): Promise<{ id: string; name: string }[]> {
    return this.db.select({ id: groups.id, name: groups.name }).from(groups).orderBy(groups.name)
  }

  /**
   * Who is in this group, and which customers it holds.
   *
   * **The read the six write routes had no counterpart for.** An administrator
   * could grant and revoke membership and never see what a group contains,
   * which is the question they are answering when they look. -> #208
   *
   * `null` when there is no such group.
   */
  async membership(groupId: string): Promise<{
    members: { userId: string; username: string; displayName: string; level: Level }[]
    customers: { customerId: string; customerName: string }[]
  } | null> {
    const [group] = await this.db
      .select({ id: groups.id })
      .from(groups)
      .where(eq(groups.id, groupId))
    if (!group) return null

    const members = await this.db
      .select({
        userId: groupMembers.userId,
        username: user.email,
        displayName: user.name,
        level: groupMembers.level,
      })
      .from(groupMembers)
      .innerJoin(user, eq(user.id, groupMembers.userId))
      .where(eq(groupMembers.groupId, groupId))

    const held = await this.db
      .select({ customerId: groupCustomers.customerId, customerName: customers.name })
      .from(groupCustomers)
      .innerJoin(customers, eq(customers.id, groupCustomers.customerId))
      .where(eq(groupCustomers.groupId, groupId))

    return { members, customers: held }
  }

  /**
   * Names are not unique: two teams may reasonably both be called Logistics,
   * and the identity is the generated id for the same reason a customer's is.
   */
  async create(name: string): Promise<{ id: string }> {
    const [made] = await this.db.insert(groups).values({ name }).returning({ id: groups.id })
    if (!made) throw new Error('the group could not be created')
    return made
  }

  /**
   * **Upserted on the pair**, because the pair is the primary key: *most
   * permissive applies* is about two different groups, never about one
   * membership recorded twice. A second grant is a change of level.
   *
   * `false` when the analyst already held that level, and nothing changed.
   */
  async grant(groupId: string, userId: string, level: Level): Promise<boolean> {
    const made = await this.db
      .insert(groupMembers)
      .values({ groupId, userId, level })
      .onConflictDoUpdate({
        target: [groupMembers.groupId, groupMembers.userId],
        set: { level },
        setWhere: ne(groupMembers.level, level),
      })
      .returning({ userId: groupMembers.userId })
    if (made.length > 0) reachChanged(userId)
    return made.length > 0
  }

  /**
   * **Silent when there was nothing to take out.** Announcing a reach change
   * that did not happen would end that analyst's open connections for nothing,
   * and a caller cannot always know whether the membership was there.
   *
   * `false` when there was no such membership.
   */
  async revoke(groupId: string, userId: string): Promise<boolean> {
    const gone = await this.db
      .delete(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
      .returning({ userId: groupMembers.userId })
    if (gone.length > 0) reachChanged(userId)
    return gone.length > 0
  }

  /**
   * Everybody in the group thereby reaches the customer's cases.
   *
   * `false` when the group already held it.
   */
  async hold(groupId: string, customerId: string): Promise<boolean> {
    const made = await this.db
      .insert(groupCustomers)
      .values({ groupId, customerId })
      .onConflictDoNothing()
      .returning({ groupId: groupCustomers.groupId })
    if (made.length > 0) await this.announceEveryMember(groupId)
    return made.length > 0
  }

  /**
   * The scenario names this beside a revocation - *the group that reached it is
   * revoked, or the customer leaves it* - because to an analyst the two are
   * the same event.
   *
   * `false` when the group did not hold it.
   */
  async release(groupId: string, customerId: string): Promise<boolean> {
    const gone = await this.db
      .delete(groupCustomers)
      .where(
        and(eq(groupCustomers.groupId, groupId), eq(groupCustomers.customerId, customerId)),
      )
      .returning({ groupId: groupCustomers.groupId })
    if (gone.length > 0) await this.announceEveryMember(groupId)
    return gone.length > 0
  }

  /**
   * **Read after the write, so the set is the one the change applied to.**
   * Reading it first would miss somebody granted a membership in between and
   * announce somebody who had just left.
   */
  private async announceEveryMember(groupId: string): Promise<void> {
    const members = await this.db
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(eq(groupMembers.groupId, groupId))
    for (const member of members) reachChanged(member.userId)
  }
}
