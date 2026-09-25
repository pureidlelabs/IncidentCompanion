/**
 * The one way a route asks for an account by its address.
 *
 * **Here rather than in `accounts/`, because that tier may reach `auth` and not
 * `db`.** The answer to that rule had been to list the whole roster through the
 * admin plugin and scan it in JavaScript, which is how a case-sensitive `===`
 * came to sit two lines from services matching case-folded.
 */
import { Inject, Injectable } from '@nestjs/common'
import { and, eq, gt, sql } from 'drizzle-orm'

import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { session, user } from '../db/schema/auth.js'
import { ADMIN_ROLE } from '../domain/analyst-account.js'
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

  /**
   * Every account holding the administrator role, with no ceiling.
   *
   * **Narrowed by role and nothing else, because `administers` is the rule.**
   * Whether a banned administrator still counts is one decision, and putting
   * half of it in SQL is how two halves come to disagree - which is the shape
   * of the defect this service exists to end. The query's job is to return a
   * set small enough to hold whole and certain to contain the target when the
   * target administers. -> `auth/last-admin.ts`
   */
  async administrators(): Promise<Analyst[]> {
    return this.db
      .select({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        banned: user.banned,
      })
      .from(user)
      .where(eq(user.role, ADMIN_ROLE))
  }

  /**
   * Sets whether the account is barred from signing in, and answers whether
   * this call is the one that changed it. Of concurrent callers asking for the
   * same state, exactly one answers `true`.
   */
  async changeBanned(id: string, banned: boolean): Promise<boolean> {
    const changed = await this.db
      .update(user)
      .set({ banned })
      .where(and(eq(user.id, id), sql`coalesce(${user.banned}, false) <> ${banned}`))
      .returning({ id: user.id })
    return changed.length > 0
  }

  /**
   * Sets the account's role, answering the role it held before, or `null` when
   * it already held this one. Of concurrent callers asking for the same role,
   * exactly one gets a role back.
   */
  async changeRole(id: string, role: string): Promise<{ from: string } | null> {
    return this.db.transaction(async (tx) => {
      const [held] = await tx.select({ role: user.role }).from(user).where(eq(user.id, id)).for('update')
      if (!held || held.role === role) return null
      await tx.update(user).set({ role }).where(eq(user.id, id))
      return { from: held.role ?? '' }
    })
  }

  /** The account an id names, so a line can say who it was about. */
  async byId(id: string): Promise<Analyst | undefined> {
    const [row] = await this.db
      .select({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        banned: user.banned,
      })
      .from(user)
      .where(eq(user.id, id))
      .limit(1)
    return row
  }

  /**
   * The accounts holding a session that has not expired.
   *
   * **Asked of the sessions rather than of the roster**, so ending every
   * session costs one revocation per signed-in analyst rather than one per
   * account the install has ever had -- and needs no paging, which is where
   * `listUsers`' ceiling of 500 would otherwise decide how many are missed.
   *
   * An expired session is left out: it is already refused, and revoking it
   * would file an audit line for an act with no effect.
   */
  async withAnOpenSession(): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ id: session.userId })
      .from(session)
      .where(gt(session.expiresAt, new Date()))
    return rows.map((row) => row.id)
  }
}
