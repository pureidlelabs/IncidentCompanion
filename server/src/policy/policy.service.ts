/**
 * Reading the install's bounds, for a door that cannot reach the database.
 *
 * **The same read as `readPolicy`, behind an injectable.** `policy/` may reach
 * `db/` and the layers with doors may not, so this is where the handle lives
 * and they take the answer. -> `architecture.test.ts`
 *
 * **Fresh on every call, deliberately.** `read.ts` says why at length: a cached
 * bound is one an administrator cannot move without a restart, and for a
 * security control that is the same as not settable.
 */
import { Inject, Injectable } from '@nestjs/common'

import { readPolicy, type PolicyValues } from './read.js'
import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'

@Injectable()
export class PolicyService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  read(): Promise<PolicyValues> {
    return readPolicy(this.db)
  }
}
