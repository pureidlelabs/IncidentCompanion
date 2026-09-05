/**
 * Whether an account still owes its own password.
 */
import { Inject, Injectable } from '@nestjs/common'
import { AuthService } from '@thallesp/nestjs-better-auth'

import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import type { Auth } from './auth.config.js'
import { user } from '../db/schema/auth.js'
import { sameAddress } from './same-address.js'

@Injectable()
export class PasswordHoldService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly auth: AuthService<Auth>,
  ) {}

  /**
   * The account was given a password by somebody else and owes its own.
   */
  async hold(email: string): Promise<void> {
    const [row] = await this.db
      .select({ id: user.id })
      .from(user)
      .where(sameAddress(email))
      .limit(1)
    if (!row) return

    const context = await this.auth.instance.$context
    await context.internalAdapter.updateUser(row.id, { mustChangePassword: true })
  }

  /**
   * The account has set its own.
   */
  async release(userId: string): Promise<void> {
    /**
     * **Written through Better Auth, not through the table.**
     */
    const context = await this.auth.instance.$context
    await context.internalAdapter.updateUser(userId, { mustChangePassword: false })
  }
}
