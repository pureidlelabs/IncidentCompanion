/**
 * Clearing a stale lockout counter on the write that means "let them back in".
 *
 * In `auth/` for the same layering reason as `PasswordHoldService` -
 * `accounts/` may reach `auth` and not `db`, so a query against the user row
 * cannot grow a second time in a folder the rule keeps off it.
 *
 * **A reset that leaves this column alone hands out a password that does not
 * work.** Applied on a successful sign-in only, `CLEARED` leaves an
 * administrator's reset with the lock standing: the new password is correct
 * and the account refuses it until the window expires on its own.
 * -> `_security/a-password-reset-left-the-lockout-standing.md`
 */
import { Inject, Injectable } from '@nestjs/common'

import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { user } from '../db/schema/auth.js'
import { CLEARED } from './lockout.js'
import { sameAddress } from './same-address.js'

@Injectable()
export class LockoutClearService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * **Unconditional, matching `CLEARED`'s own contract on the sign-in path.**
   * An administrator choosing an account's password is at least as strong a
   * signal as that account typing it correctly, so the reset takes the same
   * clearing a success does rather than a narrower one.
   */
  async clear(email: string): Promise<void> {
    await this.db.update(user).set(CLEARED).where(sameAddress(email))
  }
}
