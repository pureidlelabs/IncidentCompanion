/**
 * The two doors an incident comes through.
 */
import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common'
import { Session, type UserSession } from '@thallesp/nestjs-better-auth'
import { ZodResponse, createZodDto } from 'nestjs-zod'
import { z } from 'zod'

import { CaseAccessGuard } from '../access/case-access.guard.js'
import { CasesService } from '../cases/cases.service.js'
import { caseFormSchema } from '../domain/case.js'
import { ordered } from '../collections/entities.controller.js'
import { TABLES } from '../collections/registry.js'
import { DEFINITION as TIMELINE_DEFINITION } from '../collections/timeline.controller.js'
import {
  commitBodySchema,
  importedSchema,
  previewBodySchema,
  previewResultSchema,
} from '../domain/incident-import.js'
import { ImportService, type ImportDefinitions } from './import.service.js'

class PreviewBodyDto extends createZodDto(previewBodySchema) {}
class PreviewResultDto extends createZodDto(previewResultSchema) {}
class CommitBodyDto extends createZodDto(commitBodySchema) {}
class ImportedDto extends createZodDto(importedSchema) {}

/**
 * The start door's body: an import, plus what the case is called.
 */
const startBodySchema = commitBodySchema
  .extend({
    title: z.string().trim().min(1).max(200),
    customer: z.string().trim().max(200).optional(),
    reference: z.string().trim().max(64).optional(),
    severity: caseFormSchema.shape.severity,
    // **`offset: true`, because the control writes one.** `DateTimeInput`
    // joins its two halves with `+00:00` rather than `Z`, and the default
    // rejects an offset -- so the seeded timestamp made the whole create a 400
    // and the door simply never navigated.
    detectedAt: z.iso.datetime({ offset: true }).nullish(),
  })
  .strict()
class StartBodyDto extends createZodDto(startBodySchema) {}

const startedSchema = importedSchema.extend({ caseId: z.uuid() })
class StartedDto extends createZodDto(startedSchema) {}

/**
 * Every collection an import may write.
 */
const IMPORT_TARGETS = ['systems', 'accounts', 'network_indicators', 'malware', 'cloud_apps'] as const

/**
 * **The shipping controllers' own definitions, never rebuilt here.**
 */
function definitions(): ImportDefinitions {
  return {
    byName: Object.fromEntries(IMPORT_TARGETS.map((name) => [name, ordered(name, TABLES[name])])),
    timeline: TIMELINE_DEFINITION,
  }
}

@Controller('api/cases/:caseId/imports')
@UseGuards(CaseAccessGuard)
export class CaseImportController {
  constructor(private readonly imports: ImportService) {}

  @Post('preview')
  @ZodResponse({
    status: 200,
    type: PreviewResultDto,
    description: 'What this incident would add, judged against the case as it is now.',
  })
  async preview(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() body: PreviewBodyDto,
  ) {
    return this.imports.preview(caseId, body.incidents, definitions())
  }

  @Post()
  @ZodResponse({
    status: 201,
    type: ImportedDto,
    description: 'What was written, and what was already in the case.',
  })
  async commit(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() body: CommitBodyDto,
    @Session() session: UserSession,
  ) {
    return this.imports.commit(
      caseId,
      session.user.id,
      body.incidents,
      body.approved,
      body.edits,
      definitions(),
    )
  }
}

@Controller('api/imports')
export class StartImportController {
  constructor(
    private readonly imports: ImportService,
    private readonly cases: CasesService,
  ) {}

  /**
   * What an incident would become in a case that does not exist yet.
   */
  @Post('preview')
  @ZodResponse({
    status: 200,
    type: PreviewResultDto,
    description: 'What this incident would become in a new case.',
  })
  async preview(@Body() body: PreviewBodyDto) {
    return this.imports.preview(null, body.incidents, definitions())
  }

  /**
   * Create the case, then import into it.
   */
  @Post('case')
  @ZodResponse({
    status: 201,
    type: StartedDto,
    description: 'The case that was created, and what the incident put in it.',
  })
  async start(@Body() body: StartBodyDto, @Session() session: UserSession) {
    const created = await this.cases.create(
      {
        title: body.title,
        customer: body.customer,
        reference: body.reference,
        severity: body.severity,
        detectedAt: body.detectedAt == null ? body.detectedAt : new Date(body.detectedAt),
      },
      session.user.id,
    )
    const imported = await this.imports.commit(
      created.id,
      session.user.id,
      body.incidents,
      body.approved,
      body.edits,
      definitions(),
    )
    return { ...imported, caseId: created.id }
  }
}
