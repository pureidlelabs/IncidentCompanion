import { Logger, Module, type OnModuleInit } from '@nestjs/common'

import { CustomersController } from './customers.controller.js'
import { CustomersService } from './customers.service.js'

/**
 * The customer directory. Install-level, so it opens no case and scopes
 * nothing. -> `db/schema/customer.ts`
 *
 * The routes that create, rename, retire and merge a customer are
 * `CustomersController`, admin-gated at the class.
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
    const log = new Logger('Customers')
    log.log(`Default customer: ${name}`)

    /**
     * **Cases opened before a case carried a customer.** They read as the
     * default's and key separately in the index, so the reference rule would
     * not hold across them. Silent when there are none, which is every boot
     * after the first.
     */
    const moved = await this.customers.attributeUnattributed()
    if (moved > 0) log.log(`Put ${String(moved)} case(s) with no customer under ${name}`)
  }
}
