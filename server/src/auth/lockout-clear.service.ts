/**
 * Clearing a stale lockout counter on the write that means "let them back in".
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
   * Zeroes the failure counter and lifts the lock, whether or not either was
   * set.
   */
  async clear(email: string): Promise<void> {
    await this.db.update(user).set(CLEARED).where(sameAddress(email))
  }
}
