/**
 * `/api/install/audit/retention` - how long the audit is kept.
 */
import {
  Body,
  Controller,
  Get,
  Put,
  Req,
  UnprocessableEntityException,
} from '@nestjs/common'
import { Session, type UserSession } from '@thallesp/nestjs-better-auth'
import type { IncomingHttpHeaders } from 'node:http'
import { ZodResponse, createZodDto } from 'nestjs-zod'
import { z } from 'zod'

import { AdminOnly } from '../auth/admin-only.js'
import {
  OPERATIONAL_FLOOR_DAYS,
  RETENTION_FLOOR_DAYS,
} from '../db/schema/install-activity.js'
import { InstallActivityService } from '../install-activity/install-activity.service.js'
import {
  OPERATIONAL_DEFAULT_DAYS,
  OPERATIONAL_RETENTION_KEY,
  RETENTION_KEY,
  refuseOperationalRetention,
  refuseRetention,
} from '../install-activity/prune.service.js'
import { InstallPreferencesService } from '../preferences/install.service.js'

export const retentionSchema = z.object({
  days: z
    .number()
    .int()
    .min(RETENTION_FLOOR_DAYS)
    .describe('How many days of audit history are kept. The floor is enforced in the database too.'),
  /** So a screen can state the floor rather than hard-coding it. */
  floorDays: z.number().int(),
  /**
   * The second window, for lines that are volume rather than evidence.
   */
  operationalDays: z
    .number()
    .int()
    .min(OPERATIONAL_FLOOR_DAYS)
    .describe('How many days of high-volume operational lines are kept.'),
  operationalFloorDays: z.number().int(),
})

export type RetentionView = z.infer<typeof retentionSchema>

class RetentionDto extends createZodDto(retentionSchema) {}

/**
 * **A DTO, so the global pipe validates it and answers 422.**
 */
export const putBodySchema = z
  .object({
    days: z.number().int().optional(),
    operationalDays: z.number().int().optional(),
  })
  .strict()

class RetentionPutDto extends createZodDto(putBodySchema) {}

@AdminOnly()
@Controller('api/install/audit/retention')
export class AuditRetentionController {
  constructor(
    private readonly settings: InstallPreferencesService,
    private readonly activity: InstallActivityService,
  ) {}

  @Get()
  @ZodResponse({
    status: 200,
    type: RetentionDto,
    description: 'The retention window, and the floor it may not go below.',
  })
  async read(): Promise<RetentionView> {
    const held = await this.settings.all()
    return {
      days: Number(held[RETENTION_KEY]),
      floorDays: RETENTION_FLOOR_DAYS,
      operationalDays: Number(held[OPERATIONAL_RETENTION_KEY] ?? OPERATIONAL_DEFAULT_DAYS),
      operationalFloorDays: OPERATIONAL_FLOOR_DAYS,
    }
  }

  @Put()
  @ZodResponse({
    status: 200,
    type: RetentionDto,
    description: 'The window as it now stands. The change is recorded on the audit itself.',
  })
  async set(
    @Body() body: RetentionPutDto,
    @Session() session: UserSession,
    @Req() request: { headers: IncomingHttpHeaders },
  ): Promise<RetentionView> {
    /**
     * **The service's own sentence, as a 422.**
     */
    const refused =
      (body.days === undefined ? null : refuseRetention(body.days)) ??
      (body.operationalDays === undefined
        ? null
        : refuseOperationalRetention(body.operationalDays))
    if (refused) throw new UnprocessableEntityException({ ok: false, messages: [[refused, 'negative']] })

    // **Read before writing, or the line cannot say what it changed from** -
    // the same reason the role change reads the old role first.
    const held = await this.settings.all()
    const before = Number(held[RETENTION_KEY])
    const operationalBefore = Number(held[OPERATIONAL_RETENTION_KEY] ?? OPERATIONAL_DEFAULT_DAYS)

    if (body.days !== undefined) {
      await this.settings.set(RETENTION_KEY, body.days, session.user.id)
      await this.activity.retentionChanged(
        { session, headers: request.headers, request },
        before,
        body.days,
      )
    }
    /**
     * **Recorded the same way, and at the same level.**
     */
    if (body.operationalDays !== undefined) {
      await this.settings.set(OPERATIONAL_RETENTION_KEY, body.operationalDays, session.user.id)
      await this.activity.retentionChanged(
        { session, headers: request.headers, request },
        operationalBefore,
        body.operationalDays,
      )
    }

    return {
      days: body.days ?? before,
      floorDays: RETENTION_FLOOR_DAYS,
      operationalDays: body.operationalDays ?? operationalBefore,
      operationalFloorDays: OPERATIONAL_FLOOR_DAYS,
    }
  }
}
