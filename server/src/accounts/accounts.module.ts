/**
 * The Accounts pane's routes.
 */
import { Module } from '@nestjs/common'

import { InstallAccountsController } from './accounts.controller.js'
import { AuthModule } from '../auth/auth.module.js'

@Module({
  imports: [AuthModule],
  controllers: [InstallAccountsController],
})
export class AccountsModule {}
