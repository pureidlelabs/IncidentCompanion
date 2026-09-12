/**
 * The two doors an incident comes through.
 *
 * **One starts a case, the other adds to one.** An analyst opening a new
 * investigation from a Sentinel incident and an analyst pulling a second
 * incident into an open case want the same mapping and the same review; only
 * the destination differs. So both are the same pair of calls -- preview, then
 * commit -- and the start door is the pair with a case created between them.
 *
 * **Preview writes nothing and commit re-derives.** Nothing is parked on the
 * server between the two, so an abandoned review leaves no state and two
 * analysts previewing the same incident cannot collide. The payload is resent;
 * it is the analyst's own case data and it has just crossed this boundary once
 * already.
 */
import {
  Body,
  Controller,
  Inject,
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
import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import {
  commitBodySchema,
  importedSchema,
  previewBodySchema,
  previewResultSchema,
} from '../domain/incident-import.js'
import { ImportService } from './import.service.js'
import { caseSeverityOf } from './providers/sentinel/severity.js'
import { definitions } from './targets.js'

class PreviewBodyDto extends createZodDto(previewBodySchema) {}
class PreviewResultDto extends createZodDto(previewResultSchema) {}
class CommitBodyDto extends createZodDto(commitBodySchema) {}
class ImportedDto extends createZodDto(importedSchema) {}

/**
 * The start door's body: an import, plus what the case is called.
 *
 * **The fields the incident can seed, plus the one it cannot.** Sentinel names
 * an incident rather than an engagement, so the title and the customer are the
 * analyst's to give -- but the reference and the first activity are the
 * incident's own, and a case created without them loses what the provider
 * already knew. The client seeds them and the analyst may correct them; either
 * way they arrive here.
 *
 * **`severity` is not among them.** It is derived from `incidents`, already in
 * this body, by the mapper that owns the provider's words -- so a caller
 * naming one is refused rather than obeyed.
 *
 * **`detectedAt` cannot be**, and the reason is the document rather than the
 * type. The form declares it as `z.coerce.date()`, which `createZodDto` cannot
 * render -- *"Date cannot be represented in JSON Schema"* -- so a route body
 * reusing it publishes nothing. The wire carries the ISO string the provider
 * sent and the column takes the `Date` behind it.
 */
const startBodySchema = commitBodySchema
  .extend({
    title: z.string().trim().min(1).max(200),
    customer: z.string().trim().max(200).optional(),
    reference: z.string().trim().max(64).optional(),
    // **The offset spelling, which `DateTimeInput` no longer writes.** Its
    // `SUFFIX` is `Z`, and Zod's bare `z.iso.datetime()` refuses an offset --
    // so narrowing this refuses any seed still carrying one, and a refused seed
    // is a 422 on the whole create rather than a complaint about one field.
    detectedAt: z.iso.datetime({ offset: true }).nullish(),
  })
  .strict()
class StartBodyDto extends createZodDto(startBodySchema) {}

const startedSchema = importedSchema.extend({ caseId: z.uuid() })
class StartedDto extends createZodDto(startedSchema) {}

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
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  /**
   * What an incident would become in a case that does not exist yet.
   *
   * **No case, so every candidate is new.** The verdict a preview carries is a
   * comparison against rows already in a case; there are none, and saying so
   * with the same shape means the review screen is one component rather than
   * two.
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
   * Create the case and import into it, as one act.
   *
   * **One transaction, opened here.** The case is still written first, because
   * every row the import writes is scoped by its id -- but both writes run on
   * the handle this opens, so a failure at any of them takes the case with it
   * and the analyst is left with nothing rather than with an empty case.
   */
  @Post('case')
  @ZodResponse({
    status: 201,
    type: StartedDto,
    description: 'The case that was created, and what the incident put in it.',
  })
  async start(@Body() body: StartBodyDto, @Session() session: UserSession) {
    return this.db.transaction(async (tx) => {
      const created = await this.cases.create(
        {
          title: body.title,
          customer: body.customer,
          reference: body.reference,
          severity: caseSeverityOf(body.incidents),
          detectedAt: body.detectedAt == null ? body.detectedAt : new Date(body.detectedAt),
        },
        session.user.id,
        undefined,
        tx,
      )
      const imported = await this.imports.commit(
        created.id,
        session.user.id,
        body.incidents,
        body.approved,
        body.edits,
        definitions(),
        tx,
      )
      return { ...imported, caseId: created.id }
    })
  }
}
