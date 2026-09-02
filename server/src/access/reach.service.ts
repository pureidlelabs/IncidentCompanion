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

import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
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
 * What every analyst holds over the default customer, always.
 *
 * **Not a grant and not revocable.** The default holds only incidents whose
 * origin is not yet known, which by definition are nobody's yet; the moment an
 * incident is attributed it leaves, and reach becomes that customer's business
 * like any other. The specification excepts it from every rule about reach and
 * says so in one place so the rest can be read without an exception.
 */
const OVER_THE_DEFAULT: Level = 'write'

@Injectable()
export class ReachService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** The id of the install's default customer, or `null` before it is made. */
  private async defaultCustomerId(): Promise<string | null> {
    const [row] = await this.db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.isDefault, true))
      .limit(1)
    return row?.id ?? null
  }

  /**
   * The level this analyst holds over this customer, or `null` for none.
   *
   * **The default customer answers before any group is consulted**, so a group
   * that happens to hold it can neither raise the level nor lower it.
   */
  async levelFor(userId: string, customerId: string): Promise<Level | null> {
    if (customerId === (await this.defaultCustomerId())) return OVER_THE_DEFAULT

    const held = await this.db
      .select({ level: groupMembers.level })
      .from(groupMembers)
      .innerJoin(groupCustomers, eq(groupCustomers.groupId, groupMembers.groupId))
      .where(and(eq(groupMembers.userId, userId), eq(groupCustomers.customerId, customerId)))

    return strongest(held.map((row) => row.level))
  }

  /**
   * Every customer this analyst reaches, the default among them.
   *
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
