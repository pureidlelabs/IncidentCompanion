/**
 * The merge review's two routes.
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
 */
const resolveSchema = z.object({ choice: z.enum(['mine', 'theirs']) }).strict()

class ResolveDto extends createZodDto(resolveSchema) {}

@UseGuards(CaseAccessGuard)
@Controller('api/cases/:caseId/conflicts')
export class ConflictsController {
  constructor(private readonly conflicts: ConflictsService) {}

  /**
   * **This analyst's reviews and nobody else's.**
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
