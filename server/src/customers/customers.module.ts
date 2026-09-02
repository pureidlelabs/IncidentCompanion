import { Logger, Module, type OnModuleInit } from '@nestjs/common'

import { CustomersController } from './customers.controller.js'
import { CustomersService } from './customers.service.js'

/**
 * The customer directory. Install-level, so it opens no case and scopes
 * nothing. -> `db/schema/customer.ts`
 *
 * No controller yet: the routes that create, rename and retire a customer come
 * with the guards the specification asks of them.
 *
 * **The default is made at boot, not only by the seeder.** The specification
 * says the install *always* holds one, and a booted install that had never run
 * the one-shot held none - which cost nothing while nothing looked it up, and
 * stopped being harmless the moment reach resolved through a customer: the
 * record every unattributed case falls back to did not exist, so every case
 * became unreachable.
 *
 * Safe on every boot and on every replica: `ensureDefault` reads before it
 * writes and the partial unique index settles the race, which is what that
 * method was written for.
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
