/**
 * The routes an administrator grants and revokes reach through.
 *
 * **`AdminOnly` on the class, not per route**, so a route added later inherits
 * it rather than being the one somebody forgot. Granting reach is managing the
 * install; it is not itself reach, which is the split
 * `Managing the install and reaching case data are separate grants` draws.
 *
 * **The audit line is written here and not in `GroupsService`.** The service
 * is callable from a seeder or a migration, where there is no caller to
 * attribute; this is the layer that has a session to name.
 */
import { Body, Controller, Delete, HttpCode, Param, Post, Req } from '@nestjs/common'
import { Session, type UserSession } from '@thallesp/nestjs-better-auth'
import { UnprocessableEntityException } from '@nestjs/common'
import { ZodResponse, createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import type { IncomingHttpHeaders } from 'node:http'

import { AdminOnly } from '../auth/admin-only.js'
import { InstallActivityService } from '../install-activity/install-activity.service.js'
import { LEVELS } from '../db/schema/groups.js'
import { GroupsService } from './groups.service.js'

/**
 * **The levels come from the schema**, so one added there is accepted here
 * without an edit and one removed stops being accepted the same way. A copy of
 * the list would be a second place to keep true.
 */
const grantSchema = z.object({ userId: z.string().min(1), level: z.enum(LEVELS) }).strict()
const holdSchema = z.object({ customerId: z.uuid() }).strict()

const doneSchema = z.object({ done: z.literal(true) })
class DoneDto extends createZodDto(doneSchema) {}

const DONE = { done: true } as const

@AdminOnly()
@Controller('api/groups')
export class GroupsController {
  constructor(
    private readonly groups: GroupsService,
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

  @Post(':groupId/members')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: DoneDto, description: 'The analyst is in the group at that level.' })
  async grant(
    @Param('groupId') groupId: string,
    @Body() body: unknown,
    @Session() session: UserSession,
    @Req() request: { headers: IncomingHttpHeaders },
  ): Promise<typeof DONE> {
    const { userId, level } = this.parse(grantSchema, body)
    await this.groups.grant(groupId, userId, level)
    await this.activity.reachGranted({ session, headers: request.headers, request }, userId, {
      groupId,
      level,
    })
    return DONE
  }

  @Delete(':groupId/members/:userId')
  @ZodResponse({ status: 200, type: DoneDto, description: 'The analyst is out of the group.' })
  async revoke(
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
    @Session() session: UserSession,
    @Req() request: { headers: IncomingHttpHeaders },
  ): Promise<typeof DONE> {
    await this.groups.revoke(groupId, userId)
    await this.activity.reachRevoked({ session, headers: request.headers, request }, userId, {
      groupId,
    })
    return DONE
  }

  @Post(':groupId/customers')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: DoneDto, description: 'The group holds that customer.' })
  async hold(
    @Param('groupId') groupId: string,
    @Body() body: unknown,
    @Session() session: UserSession,
    @Req() request: { headers: IncomingHttpHeaders },
  ): Promise<typeof DONE> {
    const { customerId } = this.parse(holdSchema, body)
    await this.groups.hold(groupId, customerId)
    await this.activity.groupHeldCustomer(
      { session, headers: request.headers, request },
      customerId,
      { groupId },
    )
    return DONE
  }

  @Delete(':groupId/customers/:customerId')
  @ZodResponse({ status: 200, type: DoneDto, description: 'The group no longer holds that customer.' })
  async release(
    @Param('groupId') groupId: string,
    @Param('customerId') customerId: string,
    @Session() session: UserSession,
    @Req() request: { headers: IncomingHttpHeaders },
  ): Promise<typeof DONE> {
    await this.groups.release(groupId, customerId)
    await this.activity.groupReleasedCustomer(
      { session, headers: request.headers, request },
      customerId,
      { groupId },
    )
    return DONE
  }
}
