/**
 * The merge review's two routes.
 *
 * **Fetched rather than returned with the refusal.** The analyst's next act may
 * be a reload, and a review handed back once in a 409 body is gone the moment
 * they refresh - leaving them to reconstruct the disagreement from memory,
 * against a screen that has since refetched and now shows the other analyst's
 * value as though it were their own.
 *
 * **There is no cancel.** Closing the dialog leaves the review pending, so a
 * reload still offers it: an analyst who is not ready to choose has not chosen,
 * and discarding the question on their behalf is the one outcome neither button
 * means.
 */
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import { Session, type UserSession } from '@thallesp/nestjs-better-auth'

import { ConflictsService, rowReviewSchema, type RowReview } from './conflicts.service.js'
import { CaseAccessGuard } from '../access/case-access.guard.js'
import { z } from 'zod'
import { ZodResponse, createZodDto } from 'nestjs-zod'

class ReviewsDto extends createZodDto(z.object({ rows: z.array(rowReviewSchema) })) {}
class SettledDto extends createZodDto(
  z.object({ settled: z.number().int().describe('How many reviews were answered.') }),
) {}

/**
 * How a review is answered.
 *
 * **Enumerated rather than treated as a boolean.** A body with a typo'd choice
 * must not silently mean "take theirs", which is the answer that discards this
 * analyst's work - so the vocabulary is closed and anything else is refused.
 */
const resolveSchema = z.object({ choice: z.enum(['mine', 'theirs']) }).strict()

class ResolveDto extends createZodDto(resolveSchema) {}

@UseGuards(CaseAccessGuard)
@Controller('api/cases/:caseId/conflicts')
export class ConflictsController {
  constructor(private readonly conflicts: ConflictsService) {}

  /**
   * **This analyst's reviews and nobody else's.** The session is the only
   * source of whose they are - a query parameter here would let one analyst
   * read what another's refused save was trying to write.
   */
  @ZodResponse({
    status: 200,
    type: ReviewsDto,
    description: 'The refused saves waiting for this analyst to merge.',
  })
  @Get()
  pending(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Session() session: UserSession,
  ): Promise<{ rows: RowReview[] }> {
    return this.conflicts
      .pending(caseId, session.user.id)
      .then((rows) => ({ rows }))
  }

  @ZodResponse({
    status: 201,
    type: SettledDto,
    description: 'How many reviews the answer settled.',
  })
  @Post('resolve')
  async resolve(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() body: ResolveDto,
    @Session() session: UserSession,
  ): Promise<{ settled: number }> {
    const choice = body.choice
    return this.conflicts.resolve(caseId, session.user.id, choice)
  }
}
