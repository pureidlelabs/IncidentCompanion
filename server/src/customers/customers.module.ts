import { Module } from '@nestjs/common'

import { CustomersService } from './customers.service.js'

/**
 * The customer directory. Install-level, so it opens no case and scopes
 * nothing. -> `db/schema/customer.ts`
 *
 * No controller yet: this branch lands the record and the default, and the
 * routes that create, rename and retire a customer come with the guards the
 * specification asks of them.
 */
@Module({
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
