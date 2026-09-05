/**
 * `GET /api/cases/:id/activity` - what happened on this case, newest first.
 */
import { Controller, Get, Inject, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common'
import { desc, eq } from 'drizzle-orm'

import { CaseAccessGuard } from '../access/case-access.guard.js'
import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { withCase } from '../db/scope.js'
import { changeFeed, user } from '../db/schema/index.js'
import { z } from 'zod'
import { ZodResponse, createZodDto } from 'nestjs-zod'

/**
 * How many entries the feed answers with.
 */
const MOST = 50

const activitySchema = z.object({
  /**
   * The feed's own order. Monotonic, so a client can ask what is new since.
   */
  seq: z.number().int(),
  entity: z.string().describe('The collection written to.'),
  entityId: z.string(),
  op: z.string().describe('insert, update or delete.'),
  version: z.number().int(),
  by: z.string().describe('The analyst who wrote it, by display name.'),
  /** Seconds since the epoch, as the rest of this API spells a time. */
  at: z.number().describe('Seconds since the epoch.'),
  fields: z
    .array(z.string())
    .describe('The fields the write touched, as recorded when it was made.'),
})

type ActivityRecord = z.infer<typeof activitySchema>

class ActivityDto extends createZodDto(z.object({ rows: z.array(activitySchema) })) {}

@UseGuards(CaseAccessGuard)
@Controller('api/cases/:caseId/activity')
export class ActivityController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @ZodResponse({
    status: 200,
    type: ActivityDto,
    description: 'Recent writes on the case, newest first, with the analyst who made each.',
  })
  @Get()
  async activity(
    @Param('caseId', ParseUUIDPipe) caseId: string,
  ): Promise<{ rows: ActivityRecord[] }> {
    /**
     * **Inside the case scope, because `change_feed` is RLS-scoped.**
     */
    const feed = await withCase(this.db, caseId, (tx) =>
      tx
        .select({
          seq: changeFeed.seq,
          entity: changeFeed.entity,
          entityId: changeFeed.entityId,
          op: changeFeed.op,
          version: changeFeed.version,
          at: changeFeed.at,
          fields: changeFeed.fields,
          actorId: changeFeed.actorId,
          name: user.name,
          email: user.email,
        })
        .from(changeFeed)
        .leftJoin(user, eq(user.id, changeFeed.actorId))
        .where(eq(changeFeed.caseId, caseId))
        .orderBy(desc(changeFeed.seq))
        .limit(MOST),
    )

    return {
      rows: feed.map((row) => ({
        seq: Number(row.seq),
        entity: row.entity,
        entityId: row.entityId,
        op: row.op,
        version: row.version,
        // **The same fallback ladder attribution uses**, so one analyst is not
        // named two ways on two screens: their name, then the address they
        // signed in with, then the id as a last resort.
        by: row.name?.trim() || row.email || (row.actorId ?? ''),
        at: Math.floor(row.at.getTime() / 1000),
        fields: row.fields ?? [],
      })),
    }
  }
}
