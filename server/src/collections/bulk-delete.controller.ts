/**
 * `POST /api/cases/:id/bulk-delete` - one selection, spanning collections.
 *
 * **Its own controller because it is the one write that is not about a
 * collection.** The analyst selected rows across Assets and Malware and
 * Network; a route mounted under any one of those would be lying about what it
 * touches, and the whole point is that the deletion is *one* step.
 *
 * **It refuses rather than orphaning, and Postgres would not.** The foreign
 * keys are `ON DELETE SET NULL`, so deleting a host that twelve timeline
 * entries name succeeds and quietly blanks twelve references. The UI has a
 * whole affordance for the refusal (`referencesHolding`), and refusing is the
 * right answer: a reference is evidence about the intrusion, and losing it
 * silently is worse than a delete that asks.
 *
 * The 409 carries a count per id rather than a total, because a selection
 * spanning tables cannot be corrected from one number - which of forty rows is
 * the analyst meant to deselect?
 */
import {
  Body,
  ConflictException,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common'
import { Session, type UserSession } from '@thallesp/nestjs-better-auth'
import { z } from 'zod'

import { CaseAccessGuard } from '../access/case-access.guard.js'
import { CollectionService } from './collection.service.js'
import { referenceCounts } from './bulk-delete.service.js'
import { BULK_TARGETS } from './registry.js'
import { ZodResponse, createZodDto } from 'nestjs-zod'

/**
 * **Pairs, because a collection name is data and a key is not.**
 *
 * A record keyed by the collection does not survive the wire. The camelCase
 * middleware rewrites every key of every request body before any pipe runs and
 * cannot tell a field name from a value, so `network_indicators` arrives as
 * `networkIndicators`, the enum refuses it, and a bulk delete on that screen
 * answers *"Invalid key in record"* and deletes nothing. Only the multi-word
 * collections are hit, which is what makes it read as two screens being broken
 * rather than as the body shape.
 *
 * A `partialRecord` has a second problem worth keeping in view: Zod 4 makes
 * `z.record` with an enum key exhaustive, demanding every collection. An array
 * has neither.
 */
export const bulkDeleteBodySchema = z
  .object({
    targets: z
      .array(
        z.object({
          collection: z.enum(BULK_TARGETS),
          ids: z.array(z.uuid()).max(1000),
        }),
      )
      .max(BULK_TARGETS.length),
  })
  .strict()

/**
 * What a bulk delete answers with.
 *
 * **`missing` is not an error.** Two analysts selecting the same rows means the
 * second one's delete finds some already gone, and refusing the whole call
 * would make a race look like a fault. Both lists are returned so the screen
 * can say what actually happened.
 */
export const bulkDeletedSchema = z.object({
  deleted: z.array(z.object({ collection: z.string(), id: z.uuid() })),
  missing: z.array(z.object({ collection: z.string(), id: z.uuid() })),
})

class BulkDeletedDto extends createZodDto(bulkDeletedSchema) {}

/**
 * **A DTO, because the refusal here is generic.** Where a route answers a
 * sentence an analyst reads, the hand-parse stays and only the shape is
 * published; this one answered the validation tree either way, so naming the
 * class as the body's type lets the pipe do it and the handler stop.
 */
class BulkDeleteDto extends createZodDto(bulkDeleteBodySchema) {}

@UseGuards(CaseAccessGuard)
@Controller('api/cases/:caseId/bulk-delete')
export class BulkDeleteController {
  constructor(private readonly collections: CollectionService) {}

  @ZodResponse({
    status: 200,
    type: BulkDeletedDto,
    description: 'What was deleted, and what was already gone.',
  })
  @Post()
  async remove(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() body: BulkDeleteDto,
    @Session() session: UserSession,
  ) {
    const targets = body.targets.flatMap((one) =>
      one.ids.map((id) => ({ collection: one.collection, id })),
    )
    if (targets.length === 0) return { deleted: [], missing: [] }

    // **Checked before anything is deleted, over the whole selection.** Per
    // row it would delete the first twelve and then refuse the thirteenth,
    // which is the half-applied state the transaction exists to prevent.
    const held = await referenceCounts(this.collections.database, caseId, targets)
    if (Object.keys(held).length > 0) {
      throw new ConflictException({
        message: 'Some of those are still referenced.',
        references: held,
      })
    }

    return this.collections.removeMany(caseId, targets, session.user.id)
  }
}
