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
import { and, eq } from 'drizzle-orm'

import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { groupCustomers, groupMembers, groups } from '../db/schema/groups.js'
import { reachChanged } from './reach-changed.js'
import type { Level } from './reach.service.js'

@Injectable()
export class GroupsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Every group this install holds. */
  async all(): Promise<{ id: string; name: string }[]> {
    return this.db.select({ id: groups.id, name: groups.name }).from(groups).orderBy(groups.name)
  }

  /**
   * Make a group.
   *
   * **Without this nothing else here is reachable.** Every other act names a
   * group that already exists, so an administrator could be given membership
   * of one that could never be made -- and the reach model, which is the whole
   * of `Case data is reached through groups`, had no way in.
   *
   * Names are not unique: two teams may reasonably both be called Logistics,
   * and the identity is the generated id for the same reason a customer's is.
   */
  async create(name: string): Promise<{ id: string }> {
    const [made] = await this.db.insert(groups).values({ name }).returning({ id: groups.id })
    if (!made) throw new Error('the group could not be created')
    return made
  }

  /**
   * Put an analyst in a group at a level, or move the level they are already
   * at.
   *
   * **Upserted on the pair**, because the pair is the primary key: *most
   * permissive applies* is about two different groups, never about one
   * membership recorded twice. A second grant is a change of level.
   */
  async grant(groupId: string, userId: string, level: Level): Promise<void> {
    await this.db
      .insert(groupMembers)
      .values({ groupId, userId, level })
      .onConflictDoUpdate({ target: [groupMembers.groupId, groupMembers.userId], set: { level } })
    reachChanged(userId)
  }

  /**
   * Take an analyst out of a group.
   *
   * **Silent when there was nothing to take out.** Announcing a reach change
   * that did not happen would end that analyst's open connections for nothing,
   * and a caller cannot always know whether the membership was there.
   */
  async revoke(groupId: string, userId: string): Promise<void> {
    const gone = await this.db
      .delete(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
      .returning({ userId: groupMembers.userId })
    if (gone.length > 0) reachChanged(userId)
  }

  /** Put a customer in a group. Everybody in it reaches the customer's cases. */
  async hold(groupId: string, customerId: string): Promise<void> {
    await this.db.insert(groupCustomers).values({ groupId, customerId }).onConflictDoNothing()
    await this.announceEveryMember(groupId)
  }

  /**
   * Take a customer out of a group.
   *
   * The scenario names this beside a revocation - *the group that reached it is
   * revoked, or the customer leaves it* - because to an analyst the two are
   * the same event.
   */
  async release(groupId: string, customerId: string): Promise<void> {
    const gone = await this.db
      .delete(groupCustomers)
      .where(
        and(eq(groupCustomers.groupId, groupId), eq(groupCustomers.customerId, customerId)),
      )
      .returning({ groupId: groupCustomers.groupId })
    if (gone.length > 0) await this.announceEveryMember(groupId)
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
