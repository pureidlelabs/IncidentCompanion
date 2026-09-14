/**
 * The one way a route asks for an account by its address.
 *
 * **Here rather than in `accounts/`, because that tier may reach `auth` and not
 * `db`.** The answer to that rule had been to list the whole roster through the
 * admin plugin and scan it in JavaScript, which is how a case-sensitive `===`
 * came to sit two lines from services matching case-folded.
 */
import { Inject, Injectable } from '@nestjs/common'

import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { user } from '../db/schema/auth.js'
import type { Analyst } from './last-admin.js'
import { sameAddress } from './same-address.js'

@Injectable()
export class AccountLookupService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * The account an address names, or nothing.
   *
   * Folded through `sameAddress`, so it answers the same row the password hold
   * and the lockout clear act on. `user_email_folded` is what makes at most one
   * row possible for a given address.
   */
  async byAddress(email: string): Promise<Analyst | undefined> {
    const [row] = await this.db
      .select({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        banned: user.banned,
      })
      .from(user)
      .where(sameAddress(email))
      .limit(1)
    return row
  }
}
