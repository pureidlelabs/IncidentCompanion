/**
 * `/api/install/activity` - the audit log, read.
 */
import { Controller, Get, Query, Req } from '@nestjs/common'
import { Session, type UserSession } from '@thallesp/nestjs-better-auth'
import type { IncomingHttpHeaders } from 'node:http'
import { ZodResponse, createZodDto } from 'nestjs-zod'
import { z } from 'zod'

import { AdminOnly } from '../auth/admin-only.js'
import { InstallActivityReadService } from './read.service.js'
import { installActivity, installChannel } from '../db/schema/install-activity.js'

/**
 * One line, in the shape a reader draws and a collector ingests.
 */
export const activityLineSchema = z.object({
  /** The paging cursor. A string, because it outgrows `Number.MAX_SAFE_INTEGER`. */
  seq: z.string().describe('Ascending, gapless per row, and the cursor to resume from.'),
  id: z.uuid(),
  /** OpenTelemetry `EventName`: the class of event. */
  event: z.enum(installActivity.event.enumValues),
  channel: z.enum(installChannel.enumValues),
  /** ECS `event.outcome`. */
  outcome: z
    .enum(['success', 'failure', 'unknown'])
    .describe('Whether the event represents a success or a failure. ECS event.outcome.'),
  /** OCSF `severity` and `severity_id`. Derived; nothing writes them. */
  severity: z.enum(['Informational', 'Low', 'Medium', 'High', 'Critical', 'Fatal']),
  severityId: z.number().int().min(1).max(6),
  /** OCSF `status_id`: 1 Success, 2 Failure. */
  statusId: z.number().int(),
  /** OCSF classification: the class, its activity, and the derived type. */
  categoryUid: z.number().int(),
  classUid: z.number().int(),
  className: z.string(),
  activityId: z.number().int(),
  activityName: z.string(),
  typeUid: z.number().int().describe('class_uid * 100 + activity_id.'),
  /** OCSF `metadata`, which the framework requires on every record. */
  metadata: z.object({
    version: z.string().describe('The OCSF schema version this record claims.'),
    product: z.object({ name: z.string(), vendorName: z.string(), version: z.string() }),
    logName: z.string(),
  }),
  /** OpenTelemetry `Timestamp`, ISO 8601 UTC. */
  at: z.iso.datetime(),
  actorLabel: z.string().nullable(),
  targetLabel: z.string().nullable(),
  /** OpenTelemetry `Attributes`: what varies per occurrence. */
  attributes: z.record(z.string(), z.string()),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  /**
   * How many of this event, from this origin, sit in the same short window.
   * `1` for a lone event, and what turns a failed sign-in into a finding.
   */
  runLength: z.number().int().min(1),
})

export const activityPageSchema = z.object({
  events: z.array(activityLineSchema),
  /**
   * The cursor to ask for next, or null at the end.
   */
  nextCursor: z.string().nullable(),
  /** Every channel with a count, so the filter row can say how many it holds. */
  counts: z.record(z.string(), z.number().int()),
  /** The same, per ECS outcome, so both chip groups count one population. */
  outcomes: z.record(z.string(), z.number().int()),
  /** And per OCSF severity, on the level the row is drawn at. */
  severities: z.record(z.string(), z.number().int()),
})

export type ActivityPage = z.infer<typeof activityPageSchema>

class ActivityPageDto extends createZodDto(activityPageSchema) {}

const querySchema = z.object({
  channel: z.enum(installChannel.enumValues).optional(),
  /** Narrow to lines at or above this OCSF `severity_id`. */
  minSeverity: z.coerce.number().int().min(1).max(6).optional(),
  /** Resume after this `seq`. Absent means the newest page. */
  after: z.string().regex(/^\d{1,19}$/).optional(),
  since: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

@AdminOnly()
@Controller('api/install/activity')
export class InstallActivityController {
  constructor(private readonly reads: InstallActivityReadService) {}

  @Get()
  @ZodResponse({
    status: 200,
    type: ActivityPageDto,
    description: 'Audit lines, newest first, with a cursor and a count per log.',
  })
  async list(
    @Query() query: unknown,
    @Session() session: UserSession,
    @Req() request: { headers: IncomingHttpHeaders },
  ): Promise<ActivityPage> {
    const asked = querySchema.parse(query ?? {})
    return this.reads.page(asked, session, request.headers)
  }
}
