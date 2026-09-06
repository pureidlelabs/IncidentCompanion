/**
 * `GET /api/cases/:id/attribution` - who last wrote each row, and when.
 *
 * Derived from the change feed, which carries the version a write reached as
 * well as who made it.
 *
 * **`by` is a name**, joined here - the feed stores the account id, so
 * attribution survives a rename.
 *
 * **A row nobody has written is absent, not null.** The client keys a `Map` on
 * `table:id` and reads a miss as "no stamp".
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

const rowStampSchema = z.object({
  table: z.string(),
  entryId: z.string(),
  by: z.string().describe('The analyst who last wrote it, by display name.'),
  at: z.number().describe('Seconds since the epoch.'),
  version: z.number().int(),
})

type RowStampRecord = z.infer<typeof rowStampSchema>

class AttributionDto extends createZodDto(z.object({ rows: z.array(rowStampSchema) })) {}

@UseGuards(CaseAccessGuard)
@Controller('api/cases/:caseId/attribution')
export class AttributionController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @ZodResponse({
    status: 200,
    type: AttributionDto,
    description: 'Who last wrote each row on the case, and at which version.',
  })
  @Get()
  async stamps(
    @Param('caseId', ParseUUIDPipe) caseId: string,
  ): Promise<{ rows: RowStampRecord[] }> {
    // Newest first, then take the first sighting of each row: the feed is
    // append-only, so the latest entry for a row *is* its current stamp.
    // **Inside the case scope, because `change_feed` is RLS-scoped.** Read on
    // the bare handle, `app.case_id` is unset, every policy comparison is NULL
    // and the table answers nothing -- so the route answers `{rows: []}` however
    // many attributed writes the case holds, and every row on every screen
    // loses its stamp, looking exactly like a case nobody has touched.
    const feed = await withCase(this.db, caseId, (tx) =>
      tx
      .select({
        entity: changeFeed.entity,
        entityId: changeFeed.entityId,
        op: changeFeed.op,
        version: changeFeed.version,
        at: changeFeed.at,
        actorId: changeFeed.actorId,
        name: user.name,
        email: user.email,
      })
      .from(changeFeed)
      .leftJoin(user, eq(user.id, changeFeed.actorId))
      .where(eq(changeFeed.caseId, caseId))
      .orderBy(desc(changeFeed.seq)),
    )

    const seen = new Set<string>()
    const rows: RowStampRecord[] = []
    for (const row of feed) {
      const key = `${row.entity}:${row.entityId}`
      if (seen.has(key)) continue
      seen.add(key)
      // A deleted row has no stamp to show: the client keys off rows it is
      // rendering, and a stamp for something gone is a lookup that never hits.
      if (row.op === 'delete') continue

      rows.push({
        table: row.entity,
        entryId: row.entityId,
        by: row.name?.trim() || row.email || (row.actorId ?? ''),
        at: Math.floor(row.at.getTime() / 1000),
        version: row.version,
      })
    }
    return { rows }
  }
}
