/**
 * `GET /api/cases/:id/activity` - what happened on this case, newest first.
 *
 * **The second read over one table, and the reason it is a second controller.**
 * `attribution.controller.ts` collapses the change feed to one row per entity,
 * because its question is *who last wrote this row*. This one keeps every
 * entry, because its question is *what has been happening*. A flag on the first
 * route would have made one handler answer two questions and neither well.
 *
 * **`by` is a name**, joined here - the feed stores the account id, so history
 * survives a rename.
 *
 * **A delete stays.** Attribution drops one, since a stamp for a row nobody
 * renders is a lookup that never hits; a feed's whole job is to say the row
 * went.
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
 *
 * **Capped because the caller is a popover**, which holds around twenty rows
 * before it stops being readable. Fifty leaves room to group - several entries
 * by one analyst in one minute collapse to a line - without the query growing
 * with the case.
 */
const MOST = 50

const activitySchema = z.object({
  /**
   * The feed's own order. Not a resume cursor: `db/schema/change-feed.ts`
   * refuses a query for everything after a given `seq`.
   *
   * **A number on the wire, a `bigint` in the column.** `seq` is a
   * `bigserial`, which Drizzle hands back as a JavaScript `BigInt` - and
   * `JSON.stringify` throws on one rather than serialising it, so a route that
   * passed it through would answer 500 the first time anybody wrote to a case.
   * Narrowed here, where the loss is stated: `Number.MAX_SAFE_INTEGER` is
   * ~9e15 writes on one install, which is not a number this app reaches.
   */
  seq: z.number().int(),
  entity: z.string().describe('The collection written to.'),
  entityId: z.string(),
  op: z.string().describe('insert, update or delete.'),
  version: z.number().int(),
  by: z.string().describe('The analyst who wrote it, by display name.'),
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
     * **Inside the case scope, because `change_feed` is RLS-scoped.** Read on
     * the bare handle and `app.case_id` is unset, every policy comparison is
     * NULL, and the table answers nothing - which is a feed that looks like a
     * case nobody has touched rather than an error. `attribution.controller.ts`
     * carries the same note over the same table.
     *
     * **And the `where` names the case as well**, which is not redundant with
     * the scope: the scope is what the database enforces, the clause is what
     * this query asks for, and a route that relies only on the first is one
     * policy change away from reading the estate.
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
