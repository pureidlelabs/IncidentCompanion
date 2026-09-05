/**
 * Which customers an analyst reaches, and at what level.
 */
import { Inject, Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'

import { ADMIN_ROLE } from '../auth/auth.config.js'
import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { user } from '../db/schema/auth.js'
import { customers } from '../db/schema/customer.js'
import { groupCustomers, groupMembers } from '../db/schema/groups.js'

/** What an analyst may do to a customer's cases. */
export type Level = 'read' | 'write' | 'delete'

/**
 * Ordered weakest to strongest, which is the whole of *most permissive
 * applies*: comparing by position is the comparison, so a level added to the
 * specification is added here and nowhere else.
 */
const RANK: readonly Level[] = ['read', 'write', 'delete']

const strongest = (levels: readonly Level[]): Level | null =>
  levels.length === 0 ? null : RANK[Math.max(...levels.map((one) => RANK.indexOf(one)))]!

/**
 * What the install itself holds over the default customer, by role.
 */
const overTheDefault = (role: string | null): Level =>
  role === ADMIN_ROLE ? 'delete' : 'write'

@Injectable()
export class ReachService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** The id of the install's default customer, or `null` before it is made. */
  async defaultCustomerId(): Promise<string | null> {
    const [row] = await this.db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.isDefault, true))
      .limit(1)
    return row?.id ?? null
  }

  /**
   * The level this analyst holds over this customer, or `null` for none.
   */
  async levelFor(userId: string, customerId: string): Promise<Level | null> {
    const held = await this.db
      .select({ level: groupMembers.level })
      .from(groupMembers)
      .innerJoin(groupCustomers, eq(groupCustomers.groupId, groupMembers.groupId))
      .where(and(eq(groupMembers.userId, userId), eq(groupCustomers.customerId, customerId)))

    const granted = held.map((row) => row.level)
    if (customerId !== (await this.defaultCustomerId())) return strongest(granted)

    // The role is read here rather than taken from a caller: this is the one
    // place reach is resolved, and a caller that supplied it could supply a
    // different one to the socket than to the guard.
    const [account] = await this.db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, userId))
    return strongest([overTheDefault(account?.role ?? null), ...granted])
  }

  /**
   * Every customer this analyst reaches, the default among them.
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
