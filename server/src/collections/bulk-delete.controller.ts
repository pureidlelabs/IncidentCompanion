/**
 * `POST /api/cases/:id/bulk-delete` - one selection, spanning collections.
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
 */
export const bulkDeletedSchema = z.object({
  deleted: z.array(z.object({ collection: z.string(), id: z.uuid() })),
  missing: z.array(z.object({ collection: z.string(), id: z.uuid() })),
})

class BulkDeletedDto extends createZodDto(bulkDeletedSchema) {}

/**
 * **A DTO, because the refusal here is generic.**
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
