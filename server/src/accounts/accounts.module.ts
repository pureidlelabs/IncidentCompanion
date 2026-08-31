/**
 * The Accounts pane's routes.
 *
 * No provider of its own: every write is Better Auth's admin plugin, and
 * `AuthModule` is imported for `PasswordHoldService` alone. The layering rule
 * keeps `accounts/` off `db/`, so a query here cannot become a second way to
 * read the user row.
 */
import { Module } from '@nestjs/common'

import { InstallAccountsController } from './accounts.controller.js'
import { AuthModule } from '../auth/auth.module.js'

@Module({
  imports: [AuthModule],
  controllers: [InstallAccountsController],
})
export class AccountsModule {}
