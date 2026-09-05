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
 *
 * **The fields the incident can seed, plus the one it cannot.** Sentinel names
 * an incident rather than an engagement, so the title and the customer are the
 * analyst's to give -- but the reference, the severity and the first activity
 * are the incident's own, and a case created without them loses what the
 * provider already knew. The client seeds them and the analyst may correct
 * them; either way they arrive here.
 *
 * **`severity` is the case form's own declaration**, picked off
 * `caseFormSchema` rather than restated: the vocabulary is decided there, and a
 * second spelling here is a second thing to keep true.
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
 *
 * **A literal tuple, so `TABLES` is indexed by a name it knows.** The registry
 * is total by compilation -- a collection added there and not here is a type
 * error -- which is the property that stops this list drifting into the eighth
 * hand-written copy of the roster.
 */
const IMPORT_TARGETS = ['systems', 'accounts', 'network_indicators', 'malware', 'cloud_apps'] as const

/**
 * **The shipping controllers' own definitions, never rebuilt here.** A
 * hand-written copy is a second door that a guard added to the first never
 * reaches -- and the timeline copy dropped `schemaFor`, which is the whole
 * reference check on an imported entry the analyst edits.
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
   * Create the case, then import into it.
   *
   * **Two transactions, and the seam is deliberate rather than overlooked.**
   * The case is written first because the import needs its id to scope every
   * row; a failure after that leaves an empty case rather than nothing, and
   * the id comes back either way -- so the analyst retries through the door
   * inside the case rather than starting again.
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
