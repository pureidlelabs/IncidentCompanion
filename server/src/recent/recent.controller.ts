/**
 * `/api/recent-cases` - the cases this analyst has been in, and their pins.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common'
import { z } from 'zod'

import { ZodResponse, createZodDto } from 'nestjs-zod'

import {
  RecentService,
  recentCasesSchema,
  type RecentCases,
} from './recent.service.js'
import { Session, type UserSession } from '@thallesp/nestjs-better-auth'

import { CaseAccessGuard } from '../access/case-access.guard.js'

/**
 * **Free text and bounded, because the section list belongs to the client.**
 */
export const visitSchema = z.object({ section: z.string().trim().max(100).nullable() }).strict()
export const pinSchema = z.object({ pinned: z.boolean() }).strict()

class VisitDto extends createZodDto(visitSchema) {}
class PinDto extends createZodDto(pinSchema) {}

/** What the picker's recent list is, as the reference publishes it. */
class RecentCasesDto extends createZodDto(recentCasesSchema) {}

/**
 * Guarded per method rather than on the controller, because `GET` names no
 * case.
 */
@Controller('api/recent-cases')
export class RecentController {
  constructor(private readonly recent: RecentService) {}

  @Get()
  @ZodResponse({
    status: 200,
    type: RecentCasesDto,
    description: 'The cases this analyst has been in, pinned ones first.',
  })
  list(@Session() session: UserSession): Promise<RecentCases> {
    return this.recent.list(session.user.id)
  }

  @UseGuards(CaseAccessGuard)
  @Put(':caseId')
  async visit(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() body: VisitDto,
    @Session() session: UserSession,
  ): Promise<void> {
    await this.recent.visit(session.user.id, caseId, body.section)
  }

  @UseGuards(CaseAccessGuard)
  @Put(':caseId/pinned')
  async pin(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() body: PinDto,
    @Session() session: UserSession,
  ): Promise<void> {
    await this.recent.pin(session.user.id, caseId, body.pinned)
  }

  @UseGuards(CaseAccessGuard)
  @Delete(':caseId')
  async forget(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Session() session: UserSession,
  ): Promise<void> {
    await this.recent.forget(session.user.id, caseId)
  }
}
