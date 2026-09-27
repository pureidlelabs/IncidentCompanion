/**
 * An administrator's release of an account's lockout.
 *
 * In `auth/` for the same layering reason as `PasswordHoldService` -
 * `accounts/` may reach `auth` and not `db`, so a query against the lockout
 * cannot grow a second time in a folder the rule keeps off it.
 */
import { Inject, Injectable } from '@nestjs/common'
import { inArray } from 'drizzle-orm'

import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { user } from '../db/schema/auth.js'
import { signInLockout } from '../db/schema/lockout.js'
import { sameAddress } from './same-address.js'

@Injectable()
export class LockoutClearService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Forgets both of the account's runs: every count, lock and remembered wrong password. */
  async clear(email: string): Promise<void> {
    await this.db
      .delete(signInLockout)
      .where(inArray(signInLockout.userId, this.db.select({ id: user.id }).from(user).where(sameAddress(email))))
  }
}
