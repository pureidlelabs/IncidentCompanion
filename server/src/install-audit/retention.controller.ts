/**
 * `/api/install/audit/retention` - how long the audit is kept.
 *
 * **The one setting whose change is an attack in itself.** Every other
 * preference alters what the app does; this one alters what the app can still
 * prove, and shortening it is the cheapest way to destroy evidence - one
 * number, applied by the pruner on its next pass, and a year of history gone.
 *
 * So three things hold at once, and none of them is sufficient alone:
 *
 * - **Admin only**, like every install setting.
 * - **Floored at `RETENTION_FLOOR_DAYS`** here, in the setting's own schema,
 *   and again in the table's delete policy. The policy is the one that counts:
 *   the other two are refusals somebody can route around by reaching the
 *   database, and it is not.
 * - **The change is itself audited, with both numbers**, at `Critical` when
 *   the window shortens. A setting that quietly removes evidence and leaves no
 *   trace of having done so is worse than no setting at all.
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
   *
   * **Split per event, not per channel.** `audit_retention_changed` sits in
   * the operations channel and `case_deleted` in the case channel, so a split
   * on the channel would shorten the two lines an administrator most needs a
   * year later. -> `install-activity/retention-class.ts`
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
 *
 * Parsing by hand inside the handler was worth a `500`: a Zod error thrown
 * from a controller is an unhandled exception, and
 * `test/malformed-requests.test.ts` sweeps every write route with a body
 * nobody could mean precisely to catch that. RFC 9110 puts a well-formed body
 * the server will not act on at 422, and the pipe is what gets it right.
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
     * **The service's own sentence, as a 422.** It reads the same here as it
     * does when the pruner is asked directly - and it is a refusal the caller
     * can act on, not a crash: a plain `Error` from a controller is a `500`,
     * which tells an administrator nothing and reads as the server being
     * broken rather than the number being wrong.
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
     * **Recorded the same way, and at the same level.** Shortening the
     * operational window destroys less, but a change nobody can see is a
     * change somebody made without a trace - and the two settings sit on one
     * screen, so a caller who learned to change the quiet one is exactly whose
     * next move the audit needs to have recorded.
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
