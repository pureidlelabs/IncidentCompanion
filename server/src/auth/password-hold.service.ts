/**
 * Whether an account still owes its own password.
 *
 * **In `auth/` because the user table is authentication's**, and the layering
 * rule says so out loud: `accounts/` may reach `auth` and not `db`, so that a
 * query there cannot become a second way to read the user row - the one that
 * would not revoke a banned analyst's sessions. The accounts pane decides
 * *when* an account is held; this is the only thing that writes it.
 *
 * **Keyed by email on the way in and by id on the way out**, which is not an
 * inconsistency: the admin paths know the address they just typed, and the
 * account changing its own password knows only itself.
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
   *
   * **Written through Better Auth, for the reason `release` sets out below.**
   * A hold that reaches only the table leaves every session that is already
   * open unaffected: the interceptor and the case socket both read
   * `session.user.mustChangePassword` out of the Redis session cache. An
   * administrator resetting a signed-in analyst's password held nothing until
   * that analyst next signed in. -> `test/password-hold.test.ts`
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
   *
   * **Called unconditionally after a change, not only for a held account.** An
   * account that was not being forced writes `false` over `false`, which costs
   * one statement and removes the branch that could leave the hold in place on
   * the one path where it matters.
   */
  async release(userId: string): Promise<void> {
    /**
     * **Written through Better Auth, not through the table.** The hold is read
     * from `request.session.user.mustChangePassword`, served out of the Redis
     * session cache, so a write to Postgres alone answers `200
     * {"changed":true}` and then `403 {"mustChangePassword":true}` on every
     * route until the cached copy expires. `internalAdapter.updateUser` hands
     * the fresh user to `refreshUserSessions`, which rewrites every cached
     * session at its remaining lifetime.
     *
     * **Refreshing, never evicting.** Deleting those keys clears the hold too
     * and was the first shape this took - but `listSessions` reads the same
     * keys with no Postgres fall-through, so the user's other sessions become
     * unenumerable and a revoke-all reports success having revoked nothing.
     */
    const context = await this.auth.instance.$context
    await context.internalAdapter.updateUser(userId, { mustChangePassword: false })
  }
}
