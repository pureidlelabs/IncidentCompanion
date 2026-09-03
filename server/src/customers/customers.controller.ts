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
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common'
import { UnprocessableEntityException } from '@nestjs/common'
import { Session, type UserSession } from '@thallesp/nestjs-better-auth'
import { ZodResponse, createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import type { IncomingHttpHeaders } from 'node:http'

import { AdminOnly } from '../auth/admin-only.js'
import { InstallActivityService } from '../install-activity/install-activity.service.js'
import { CustomersService } from './customers.service.js'

/**
 * What an administrator may set: the name, and the organisation's own facts
 * with the types the columns actually have.
 *
 * **Written out rather than derived, and that is the opposite call from the
 * merge on purpose.** `MERGE_FACTS` is derived and disputable-by-default
 * because forgetting a column there is *noisy and harmless* -- the merge asks
 * about one fact too many. Deriving the same set here would make a column
 * added to `customers` caller-settable by default, which is fail-open at a
 * trust boundary. Identical derivation, opposite failure direction, so the
 * same set cannot serve both.
 *
 * **A name list gives names without types.** It can say which keys are
 * allowed and can never say what values are, so it cannot be the whole input
 * contract: `z.unknown().optional()` guards `undefined` and admits an explicit
 * `null`, and four of these columns are `NOT NULL`.
 *
 * The derivation is kept as the *check* -- `customers.controller.test.ts`
 * asserts these keys are exactly `MERGE_FACTS`, so a column added to the table
 * cannot be silently forgotten. What it no longer does is decide, on the
 * author's behalf, that the column is settable.
 *
 * **`isDefault` is not among them.** Exactly one default is a database
 * constraint and which record it is is not an editable property; the
 * specification says the default cannot be edited into an ordinary customer,
 * and leaving the field out is how that is true rather than checked.
 */
const optionalText = z.string().trim().max(2000).nullable().optional()
const requiredText = z.string().trim().max(2000).optional()
const wholeNumber = z.int().nonnegative().nullable().optional()

const FACTS = {
  /**
   * Free text for now, and it should not stay that way: the vocabulary exists
   * in `preferences/regimes.controller.ts` and is private to it, so an analyst
   * can write `gdrp` here and it matches nothing for ever. Sharing that list
   * is its own piece of work.
   */
  regimes: z.array(z.string().trim().min(1)).nullable().optional(),
  homeMemberState: optionalText,

  // The four `NOT NULL` columns. No `.nullable()`, which is the whole of the
  // 23502 this replaces -- omitting them is fine, sending null is not.
  outsideEuReach: z.boolean().optional(),
  outsideEuCountries: requiredText,
  competentAuthority: requiredText,
  dpoContact: requiredText,

  usersTotalCount: wholeNumber,
  annualTurnoverEur: wholeNumber,
  doraCriticalFunctions: optionalText,
  doraSupervisedServices: optionalText,
}

/** The keys above, for the case that holds them against `MERGE_FACTS`. */
export const SETTABLE_FACTS: readonly string[] = Object.keys(FACTS)

const named = z.string().trim().min(1, 'A customer needs a name.').max(200)

/**
 * **Strict, both of them.** `mergeSchema` was and these were not, so a typo'd
 * field was refused on one route and silently stripped on the other -- and the
 * strip is the worse half, because the administrator believes the value
 * landed.
 */
const createSchema = z.object({ ...FACTS, name: named }).strict()
const changeSchema = z.object({ ...FACTS, name: named.optional() }).strict()
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

  /**
   * `ParseUUIDPipe` on every `:id` below, so a malformed one is a 400 rather
   * than the Postgres cast refusing it as a 500.
   *
   * **The pipe is enough here and is not enough on a case route.** A case
   * route's guard queries the id before any pipe runs -- `case-access.guard.ts`
   * records that, and checks the shape itself. Nothing reads these ids before
   * the pipe does.
   */
  @Patch(':id')
  @ZodResponse({ status: 200, type: DoneDto, description: 'The customer was changed.' })
  async change(
    @Param('id', ParseUUIDPipe) id: string,
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
    @Param('id', ParseUUIDPipe) id: string,
    @Session() session: UserSession,
    @Req() request: { headers: IncomingHttpHeaders },
  ): Promise<typeof DONE> {
    const { name } = await this.customers.remove(id)
    await this.activity.customerRemoved({ session, headers: request.headers, request }, id, name)
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
    @Param('id', ParseUUIDPipe) surviving: string,
    @Body() body: unknown,
    @Session() session: UserSession,
    @Req() request: { headers: IncomingHttpHeaders },
  ): Promise<typeof DONE> {
    const { losing, choices } = this.parse(mergeSchema, body)
    const { losingName } = await this.customers.merge({
      losing,
      surviving,
      choices,
      actorId: session.user.id,
    })
    await this.activity.customersMerged(
      { session, headers: request.headers, request },
      surviving,
      { losing, losingName },
    )
    return DONE
  }
}
