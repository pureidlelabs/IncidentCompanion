import { Logger, Module, type OnModuleInit } from '@nestjs/common'

import { CustomersController } from './customers.controller.js'
import { CustomersService } from './customers.service.js'

/**
 * The customer directory. Install-level, so it opens no case and scopes
 * nothing. -> `db/schema/customer.ts`
 */
@Module({
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule implements OnModuleInit {
  constructor(private readonly customers: CustomersService) {}

  async onModuleInit(): Promise<void> {
    const { name } = await this.customers.ensureDefault()
    new Logger('Customers').log(`Default customer: ${name}`)
  }
}
