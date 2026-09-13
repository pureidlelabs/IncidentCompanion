/**
 * Reading the reach model: what an account reaches, and who reaches a customer.
 *
 * **Its own prefix rather than two more routes under `api/groups`.** A group
 * controller already binds `:groupId`, and a sibling path segment beside it
 * resolves by declaration order -- so `/api/groups/reach/...` would be read as
 * a group whose id is `reach` the day somebody moves a method. These questions
 * are not about a group anyway: one is asked of an account and the other of a
 * customer, and a group is only ever the answer. -> #208
 */
import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common'
import { ZodResponse, createZodDto } from 'nestjs-zod'
import { z } from 'zod'

import { AdminOnly } from '../auth/admin-only.js'
import { LEVELS } from '../db/schema/groups.js'
import { ReachService } from './reach.service.js'

/**
 * Why somebody reaches a customer.
 *
 * **The provenance is the half that makes the answer useful.** A level with no
 * grant beside it tells an administrator that somebody reaches a customer and
 * not which grant to revoke, which is the question they opened the screen to
 * answer.
 */
const grantedSchema = z.discriminatedUnion('by', [
  z.object({ by: z.literal('group'), groupId: z.uuid(), groupName: z.string() }),
  z.object({ by: z.literal('default') }),
])

const reachOfSchema = z.object({
  reaches: z.array(
    z.object({
      customerId: z.uuid(),
      customerName: z.string(),
      level: z.enum(LEVELS),
      granted: grantedSchema,
    }),
  ),
})
class ReachOfDto extends createZodDto(reachOfSchema) {}

const reachToSchema = z.object({
  reachedBy: z.array(
    z.object({
      userId: z.string(),
      username: z.string(),
      displayName: z.string(),
      level: z.enum(LEVELS),
      granted: grantedSchema,
    }),
  ),
})
class ReachToDto extends createZodDto(reachToSchema) {}

@AdminOnly()
@Controller('api/reach')
export class ReachController {
  constructor(private readonly reach: ReachService) {}

  /**
   * *An administrator MUST be able to answer, without leaving this
   * application: who can sign in, what each of them reaches, why they reach
   * it.* This is the second and third of those.
   */
  @Get('account/:userId')
  @ZodResponse({
    status: 200,
    type: ReachOfDto,
    description: 'Every customer this account reaches, with the level and what granted it.',
  })
  async ofAccount(@Param('userId') userId: string): Promise<z.infer<typeof reachOfSchema>> {
    return { reaches: await this.reach.reachOf(userId) }
  }

  /**
   * *The same MUST be answerable from the other end: for a customer, who
   * reaches it and how.*
   */
  @Get('customer/:customerId')
  @ZodResponse({
    status: 200,
    type: ReachToDto,
    description: 'Every analyst who reaches this customer, with the level and what granted it.',
  })
  async ofCustomer(
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ): Promise<z.infer<typeof reachToSchema>> {
    return { reachedBy: await this.reach.reachTo(customerId) }
  }
}
