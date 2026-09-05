/**
 * The case routes.
 */
import {
  BadRequestException,
  UnprocessableEntityException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import type { IncomingHttpHeaders } from 'node:http'
import { InstallActivityService } from '../install-activity/install-activity.service.js'
import { Session, type UserSession } from '@thallesp/nestjs-better-auth'
import { z } from 'zod'

import { CaseAccessGuard } from '../access/case-access.guard.js'
import { caseReadSchema } from '../domain/case.js'
import { caseOwnedRowSchema, readStamp } from '../domain/field-spec.js'

import { CASE_COLLECTIONS, type CaseCollection, CasesService } from './cases.service.js'
import { DemoSeederService } from '../demos/seeder.service.js'
import { caseTemplateSchema } from '../library/kinds.js'
import { LibraryService } from '../library/library.service.js'
import { CreateCaseDto, patchCaseSchema } from './cases.dto.js'
import { demoCaseSchema } from '../demos/catalogue.js'
import { ZodResponse, createZodDto } from 'nestjs-zod'

/**
 * A demo card, as the picker draws it.
 */
export const demoCardSchema = demoCaseSchema.extend({
  id: z.uuid().describe('The seeded case this card opens.'),
})

class DemoCardsDto extends createZodDto(z.array(demoCardSchema)) {}

/**
 * What the case routes answer with: `caseReadSchema`, which `wire.ts` also
 * infers `CaseRow` from, so the document, the client's type and the runtime
 * check are one description.
 */
class CaseDto extends createZodDto(caseReadSchema) {}

/**
 * A stored row as the wire declares it: the narrowing from Drizzle's `string`
 * columns to their vocabularies, which holds because every write is parsed by
 * Zod before it lands. Asserted once here rather than at five returns.
 */
type CaseIn = z.input<typeof caseReadSchema>
type CaseOwnedRow = z.input<typeof caseOwnedRowSchema>

const asWire = <T>(row: T): T & CaseIn => row as T & CaseIn

/** The same, for the whole-case read: its collections come back `unknown[]`. */
const asDocument = <T>(row: T): T & CaseIn & Record<CaseCollection, CaseOwnedRow[]> =>
  row as T & CaseIn & Record<CaseCollection, CaseOwnedRow[]>

/**
 * Only the case row needs widening here - `ReportStub` is a declared shape, so
 * a select that grew a column is a type error rather than something a cast
 * would have absorbed.
 */
const asSummary = asWire

class CasesDto extends createZodDto(z.array(caseReadSchema)) {}
class CaseDocumentDto extends createZodDto(
  caseReadSchema.extend(
    // Built from `CASE_COLLECTIONS` rather than listed: a collection added
    // there and forgotten here is the missing key that crashes the workspace
    // on open, which is the defect this route's docstring already records.
    Object.fromEntries(
      CASE_COLLECTIONS.map((name) => [name, z.array(caseOwnedRowSchema)]),
    ) as Record<CaseCollection, z.ZodArray<typeof caseOwnedRowSchema>>,
  ),
) {}
/**
 * **Counts keyed from `CASE_COLLECTIONS`, like the document's arrays.**
 */
class CaseSummaryDto extends createZodDto(
  caseReadSchema.extend({
    counts: z.object(
      Object.fromEntries(CASE_COLLECTIONS.map((name) => [name, z.number().int()])) as Record<
        CaseCollection,
        z.ZodNumber
      >,
    ),
    attention: z.record(z.string(), z.number().int()),
    // `.strict()`, so a widened select is a failing response rather than a
    // quietly fat one - the whole row carries `document` and `frozen`.
    reports: z.array(
      z
        .object({
          id: z.string(),
          label: z.string(),
          // `readStamp`, never `z.date()` - `toJSONSchema` refuses a date and
          // the whole document's schema fails to publish. -> `field-spec.ts`
          sentAt: readStamp().nullable(),
        })
        .strict(),
    ),
  }),
) {}

class RemovedDto extends createZodDto(z.object({})) {}

@Controller('api')
export class CasesController {
  constructor(
    private readonly cases: CasesService,
    private readonly demos: DemoSeederService,
    /** Resolves a template name to the checklist a new case is seeded with. */
    private readonly library: LibraryService,
    private readonly activity: InstallActivityService,
  ) {}


  /**
   * The demo cards. Each carries the seeded case's id, so the pane links
   * straight into it - opening a demo is navigation now, not a build.
   */
  @Get('demos')
  @ZodResponse({
    status: 200,
    type: DemoCardsDto,
    description: 'The demo cases this install seeded, as the picker lists them.',
  })
  listDemos() {
    return this.demos.cards()
  }

  @Get('cases')
  @ZodResponse({ status: 200, type: CasesDto, description: 'Every case, newest first.' })
  async list(): Promise<CaseIn[]> {
    return (await this.cases.list()).map(asWire)
  }

  /**
   * What the rail draws - twelve counts, one attention number and the reports
   * list - without the rows behind them.
   */
  @Get('cases/:caseId/summary')
  @UseGuards(CaseAccessGuard)
  @ZodResponse({
    status: 200,
    type: CaseSummaryDto,
    description: 'The case, a count per collection, and what needs attention.',
  })
  async summary(@Param('caseId', ParseUUIDPipe) id: string) {
    return asSummary(await this.cases.summary(id))
  }

  @Get('cases/:caseId')
  @UseGuards(CaseAccessGuard)
  @ZodResponse({ status: 200, type: CaseDocumentDto, description: 'The whole case, collections included.' })
  async get(@Param('caseId', ParseUUIDPipe) id: string) {
    return asDocument(await this.cases.getWithCollections(id))
  }

  /**
   * **A named template that does not exist is a 404, not a silently empty
   * case.**
   */
  @Post('cases')
  @ZodResponse({ status: 201, type: CaseDto, description: 'The case as stored.' })
  async create(
    @Body() body: CreateCaseDto,
    @Session() session: UserSession,
    @Req() request: { headers: IncomingHttpHeaders },
  ): Promise<CaseIn> {
    const { template, openedAt, ...rest } = body as CreateCaseDto & {
      template?: string
      openedAt?: string
    }
    /**
     * **The wire says ISO, the column takes a `Date`, and this is the boundary.**
     */
    const fields = { ...rest, ...(openedAt ? { openedAt: new Date(openedAt) } : {}) }
    if (!template) {
      const made = await this.cases.create(fields, session.user.id)
      await this.activity.caseCreated(
        { session, headers: request.headers, request },
        made.id,
        made.title,
      )
      return asWire(made)
    }

    const row = await this.library.entry('templates', template)
    if (!row) throw new NotFoundException(`No case template "${template}".`)
    const seed = caseTemplateSchema.safeParse(row.payload)
    if (!seed.success) {
      throw new BadRequestException({
        message: `The template "${template}" cannot be read.`,
        errors: seed.error.issues,
      })
    }
    const made = await this.cases.create(fields, session.user.id, seed.data)
    await this.activity.caseCreated(
        { session, headers: request.headers, request },
        made.id,
        made.title,
      )
    return asWire(made)
  }

  /**
   * **`version` is the caller's and is not part of the patch** - it is what
   * they read, so it is checked rather than written, exactly as an entity
   * patch does.
   */
  @Patch('cases/:caseId')
  @ZodResponse({ status: 200, type: CaseDto, description: 'The case as stored after the patch.' })
  @UseGuards(CaseAccessGuard)
  async patch(
    @Param('caseId', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Session() session: UserSession,
  ): Promise<CaseIn> {
    const { version, ...rest } = (body ?? {}) as { version?: unknown } & Record<string, unknown>
    if (!Number.isInteger(version)) {
      throw new UnprocessableEntityException({ message: 'A patch has to name the version it read.' })
    }

    const parsed = patchCaseSchema.safeParse(rest)
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        message: 'Validation failed',
        errors: z.treeifyError(parsed.error),
      })
    }
    if (Object.keys(parsed.data).length === 0) {
      throw new UnprocessableEntityException({ message: 'A patch has to change something.' })
    }

    const result = await this.cases.patch(id, version as number, parsed.data, session.user.id)
    if (result.ok) return asWire(result.row)
    if (result.currentVersion === null) throw new NotFoundException(`No case ${id}.`)

    throw new ConflictException({
      message: 'Someone else wrote this first.',
      currentVersion: result.currentVersion,
    })
  }

  /**
   * **No version, and no soft delete.**
   */
  @Delete('cases/:caseId')
  @ZodResponse({ status: 200, type: RemovedDto, description: 'The case and everything in it are gone.' })
  @UseGuards(CaseAccessGuard)
  async remove(
    @Param('caseId', ParseUUIDPipe) id: string,
    @Session() session: UserSession,
    @Req() request: { headers: IncomingHttpHeaders },
  ): Promise<Record<string, never>> {
    // **Read the title before the delete**, or there is nothing left to read.
    const going = await this.cases.get(id)
    await this.cases.remove(id, session.user.id)

    /**
     * **Demonstration content leaves nothing, including this line.**
     */
    if (!going?.isDemo) {
      await this.activity.caseDeleted(
        { session, headers: request.headers, request },
        id,
        going?.title ?? '',
      )
    }
    return {}
  }
}
