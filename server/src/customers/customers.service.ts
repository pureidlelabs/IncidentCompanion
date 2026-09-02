/**
 * The customer directory.
 *
 * **The install always holds a default customer**, standing for an incident
 * whose origin is not yet known, so a case can be opened before anybody has
 * been onboarded. `openspec/specs/customers/spec.md` requires it to exist, to
 * be undeletable, and not to be editable into an ordinary customer.
 *
 * Exactly one is enforced by a partial unique index rather than here: a check
 * in this file is one forgotten call site away from an install with two, and
 * half the code would then disagree about which was the default.
 */
import { Inject, Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'

import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { customers } from '../db/schema/customer.js'

/**
 * What the default is called before anybody renames it.
 *
 * **The name is not the identity.** A rename leaves it the default, because
 * what marks it is the flag rather than this string -- which is the point of
 * the first requirement: renaming an organisation breaks nothing that refers
 * to it.
 */
export const DEFAULT_CUSTOMER_NAME = 'Not yet attributed'

@Injectable()
export class CustomersService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * The default customer, made if the install has none.
   *
   * Safe to call on every boot: the insert is conditional on the read, and the
   * unique index is what settles a race between two processes doing it at
   * once -- the loser's insert is refused and it reads the winner's row.
   */
  async ensureDefault(): Promise<{ id: string; name: string }> {
    const [existing] = await this.db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(eq(customers.isDefault, true))
      .limit(1)
    if (existing) return existing

    const [made] = await this.db
      .insert(customers)
      .values({ name: DEFAULT_CUSTOMER_NAME, isDefault: true })
      .onConflictDoNothing()
      .returning({ id: customers.id, name: customers.name })
    if (made) return made

    // Somebody else won the race between the read and the insert.
    const [theirs] = await this.db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(eq(customers.isDefault, true))
      .limit(1)
    if (!theirs) throw new Error('the install has no default customer and one could not be made')
    return theirs
  }
}
