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
import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common'
import { Session, type UserSession } from '@thallesp/nestjs-better-auth'
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { ZodResponse, createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import type { IncomingHttpHeaders } from 'node:http'

import { AdminOnly } from '../auth/admin-only.js'
import { InstallActivityService } from '../install-activity/install-activity.service.js'
import { LEVELS } from '../db/schema/groups.js'
import { isMissingParent } from '../db/missing-parent.js'
import { GroupsService } from './groups.service.js'

const grantSchema = z.object({ userId: z.string().min(1), level: z.enum(LEVELS) }).strict()
const holdSchema = z.object({ customerId: z.uuid() }).strict()


const createSchema = z
  .object({ name: z.string().trim().min(1, 'A group needs a name.').max(200) })
  .strict()

const groupSchema = z.object({ id: z.uuid(), name: z.string() })
const listSchema = z.object({ groups: z.array(groupSchema) })
const madeSchema = z.object({ id: z.uuid() })
class GroupListDto extends createZodDto(listSchema) {}
class GroupMadeDto extends createZodDto(madeSchema) {}


const membershipSchema = z.object({
  members: z.array(
    z.object({
      userId: z.string(),
      username: z.string(),
      displayName: z.string(),
      level: z.enum(LEVELS),
    }),
  ),
  customers: z.array(z.object({ customerId: z.uuid(), customerName: z.string() })),
})
class MembershipDto extends createZodDto(membershipSchema) {}

const DONE = { done: true } as const

const doneSchema = z.object({ done: z.literal(true) })
class GroupDoneDto extends createZodDto(doneSchema) {}

@AdminOnly()
@Controller('api/groups')
export class GroupsController {
  constructor(
    private readonly groups: GroupsService,
    private readonly activity: InstallActivityService,
  ) {}

  private parse<T>(schema: z.ZodType<T>, body: unknown): T {
    const parsed = schema.safeParse(body ?? {})
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        message: parsed.error.issues.map((one) => one.message).join(' '),
      })
    }
    return parsed.data
  }

  /**
   * Runs a write whose only check on its ids is a foreign key, and turns the
   * constraint's refusal into one.
   *
   * **`what` names both parents, because the constraint does not say which.**
   * A grant carries a group and an analyst and either can be gone; guessing
   * one would name the wrong row about half the time, and re-reading both to
   * find out races the write it is about to make anyway.
   */
  private async named(write: () => Promise<void>, what: string): Promise<void> {
    try {
      await write()
    } catch (error) {
      if (!isMissingParent(error)) throw error
      throw new NotFoundException(`No ${what}.`)
    }
  }

  @Get()
  @ZodResponse({ status: 200, type: GroupListDto, description: 'Every group this install holds.' })
  async list(): Promise<z.infer<typeof listSchema>> {
    return { groups: await this.groups.all() }
  }

  /**
   * What this group contains.
   *
   * **The read the six writes had no counterpart for.** An administrator could
   * grant and revoke membership and never see what a group holds, which is the
   * question they are answering when they open it. -> #208
   */
  @Get(':groupId')
  @ZodResponse({
    status: 200,
    type: MembershipDto,
    description: 'Who is in this group, and which customers it holds.',
  })
  async membership(
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ): Promise<z.infer<typeof membershipSchema>> {
    return this.groups.membership(groupId)
  }

  @Post()
  @ZodResponse({ status: 201, type: GroupMadeDto, description: 'The group was created.' })
  async create(
    @Body() body: unknown,
    @Session() session: UserSession,
    @Req() request: { headers: IncomingHttpHeaders },
  ): Promise<{ id: string }> {
    const { name } = this.parse(createSchema, body)
    const made = await this.groups.create(name)
    await this.activity.groupCreated({ session, headers: request.headers, request }, made.id, {
      name,
    })
    return made
  }

  @Post(':groupId/members')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: GroupDoneDto, description: 'The analyst is in the group at that level.' })
  async grant(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() body: unknown,
    @Session() session: UserSession,
    @Req() request: { headers: IncomingHttpHeaders },
  ): Promise<typeof DONE> {
    const { userId, level } = this.parse(grantSchema, body)
    await this.named(() => this.groups.grant(groupId, userId, level), `group ${groupId} or analyst ${userId}`)
    await this.activity.reachGranted({ session, headers: request.headers, request }, userId, {
      groupId,
      level,
    })
    return DONE
  }

  @Delete(':groupId/members/:userId')
  @ZodResponse({ status: 200, type: GroupDoneDto, description: 'The analyst is out of the group.' })
  async revoke(
    @Param('groupId', ParseUUIDPipe) groupId: string,
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
  @ZodResponse({ status: 200, type: GroupDoneDto, description: 'The group holds that customer.' })
  async hold(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() body: unknown,
    @Session() session: UserSession,
    @Req() request: { headers: IncomingHttpHeaders },
  ): Promise<typeof DONE> {
    const { customerId } = this.parse(holdSchema, body)
    await this.named(() => this.groups.hold(groupId, customerId), `group ${groupId} or customer ${customerId}`)
    await this.activity.groupHeldCustomer(
      { session, headers: request.headers, request },
      customerId,
      { groupId },
    )
    return DONE
  }

  @Delete(':groupId/customers/:customerId')
  @ZodResponse({ status: 200, type: GroupDoneDto, description: 'The group no longer holds that customer.' })
  async release(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('customerId', ParseUUIDPipe) customerId: string,
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
