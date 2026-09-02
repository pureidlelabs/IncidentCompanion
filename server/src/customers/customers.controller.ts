/**
 * The routes an administrator keeps the customer directory through.
 *
 * **`AdminOnly` on the class, not per route**, so one added later inherits it.
 * Which customers exist is the management plane, which
 * `accounts-and-access` puts with an administrator alone.
 *
 * **The audit line is written here and not in `CustomersService`.** The
 * service is callable from a seeder and from the boot that makes the default,
 * where there is no caller to attribute; this is the layer with a session to
 * name.
 *
 * **These routes are what `merge` was missing.** Its three defects survived
 * because nothing called it: code exercised only by its own test accumulates
 * exactly that, the test having been written from the same understanding as
 * the code.
 */
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common'
import { UnprocessableEntityException } from '@nestjs/common'
import { Session, type UserSession } from '@thallesp/nestjs-better-auth'
import { ZodResponse, createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import type { IncomingHttpHeaders } from 'node:http'

import { AdminOnly } from '../auth/admin-only.js'
import { InstallActivityService } from '../install-activity/install-activity.service.js'
import { CustomersService } from './customers.service.js'
import { MERGE_FACTS } from './organisation-facts.js'

/**
 * What an administrator may set, which is the name and the organisation's own
 * facts.
 *
 * **`isDefault` is not among them.** Exactly one default is a database
 * constraint and which record it is is not an editable property; the
 * specification says the default cannot be edited into an ordinary customer,
 * and leaving the field out is how that is true rather than checked.
 *
 * The facts come from `MERGE_FACTS`, which is every organisation fact the
 * record holds -- so a column added to `customers` is settable without an
 * edit here, and the same set that can be disputed can be answered.
 */
const FACTS = Object.fromEntries(MERGE_FACTS.map((name) => [name, z.unknown().optional()]))

const named = z.string().trim().min(1, 'A customer needs a name.')

// Spread rather than `.extend`, so `name` keeps its own type while the facts
// stay `unknown` -- the column types are the schema's and are checked there.
const createSchema = z.object({ ...FACTS, name: named })
const changeSchema = z.object({ ...FACTS, name: named.optional() })
const mergeSchema = z
  .object({ losing: z.uuid(), choices: z.record(z.string(), z.unknown()).default({}) })
  .strict()

const customerSchema = z.object({ id: z.uuid(), name: z.string(), isDefault: z.boolean() })
const listSchema = z.object({ customers: z.array(customerSchema) })
const madeSchema = z.object({ id: z.uuid() })
const doneSchema = z.object({ done: z.literal(true) })

class CustomerListDto extends createZodDto(listSchema) {}
class CustomerMadeDto extends createZodDto(madeSchema) {}
class DoneDto extends createZodDto(doneSchema) {}

const DONE = { done: true } as const

@AdminOnly()
@Controller('api/customers')
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly activity: InstallActivityService,
  ) {}

  /** 422 with the reason, matching what every other write here answers. */
  private parse<T>(schema: z.ZodType<T>, body: unknown): T {
    const parsed = schema.safeParse(body ?? {})
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        message: parsed.error.issues.map((one) => one.message).join(' '),
      })
    }
    return parsed.data
  }

  @Get()
  @ZodResponse({ status: 200, type: CustomerListDto, description: 'Every customer this install holds.' })
  async list(): Promise<z.infer<typeof listSchema>> {
    return { customers: await this.customers.all() }
  }

  @Post()
  @ZodResponse({ status: 201, type: CustomerMadeDto, description: 'The customer was created.' })
  async create(
    @Body() body: unknown,
    @Session() session: UserSession,
    @Req() request: { headers: IncomingHttpHeaders },
  ): Promise<{ id: string }> {
    const { name, ...facts } = this.parse(createSchema, body)
    const made = await this.customers.create(name, facts)
    await this.activity.customerCreated({ session, headers: request.headers, request }, made.id, {
      name,
    })
    return made
  }

  @Patch(':id')
  @ZodResponse({ status: 200, type: DoneDto, description: 'The customer was changed.' })
  async change(
    @Param('id') id: string,
    @Body() body: unknown,
    @Session() session: UserSession,
    @Req() request: { headers: IncomingHttpHeaders },
  ): Promise<typeof DONE> {
    const values = this.parse(changeSchema, body)
    await this.customers.change(id, values)
    await this.activity.customerChanged({ session, headers: request.headers, request }, id, {
      fields: Object.keys(values).sort().join(', '),
    })
    return DONE
  }

  @Delete(':id')
  @ZodResponse({ status: 200, type: DoneDto, description: 'The customer was removed.' })
  async remove(
    @Param('id') id: string,
    @Session() session: UserSession,
    @Req() request: { headers: IncomingHttpHeaders },
  ): Promise<typeof DONE> {
    await this.customers.remove(id)
    await this.activity.customerRemoved({ session, headers: request.headers, request }, id)
    return DONE
  }

  /**
   * **The survivor is in the path and the loser is in the body**, because the
   * survivor is what the analyst will go on working with and the request is
   * about it.
   */
  @Post(':id/merge')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: DoneDto, description: 'The two records are one.' })
  async merge(
    @Param('id') surviving: string,
    @Body() body: unknown,
    @Session() session: UserSession,
    @Req() request: { headers: IncomingHttpHeaders },
  ): Promise<typeof DONE> {
    const { losing, choices } = this.parse(mergeSchema, body)
    await this.customers.merge({ losing, surviving, choices, actorId: session.user.id })
    await this.activity.customersMerged(
      { session, headers: request.headers, request },
      surviving,
      { losing },
    )
    return DONE
  }
}
