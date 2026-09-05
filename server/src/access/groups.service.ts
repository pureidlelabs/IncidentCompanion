/**
 * Granting and revoking what an analyst reaches: groups, the customers they
 * hold, and who is in them at what level.
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
   */
  async create(name: string): Promise<{ id: string }> {
    const [made] = await this.db.insert(groups).values({ name }).returning({ id: groups.id })
    if (!made) throw new Error('the group could not be created')
    return made
  }

  /**
   * Put an analyst in a group at a level, or move the level they are already
   * at.
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
   */
  private async announceEveryMember(groupId: string): Promise<void> {
    const members = await this.db
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(eq(groupMembers.groupId, groupId))
    for (const member of members) reachChanged(member.userId)
  }
}
