/**
 * The case routes.
 *
 * No `@Public()` anywhere: the global guard authenticates every route, so one
 * added below is closed without saying so.
 *
 * **`CaseAccessGuard` goes on the handler, not the class** - `demos`, the list
 * and the create carry no case in their path, and the guard refuses a route
 * that mounts it and names no `caseId`. Spell the parameter `caseId`; it is
 * the only name the guard reads.
 *
 * **The author comes from the caller's own session, never from the body.**
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
 *
 * **The catalogue's own schema, extended rather than restated.** `id` is the
 * seeded case's, which the catalogue cannot know: the definitions are static
 * and the rows are minted per install.
 */
export const demoCardSchema = demoCaseSchema.extend({
  id: z.uuid().describe('The seeded case this card opens.'),
})

class DemoCardsDto extends createZodDto(z.array(demoCardSchema)) {}

/**
 * What the case routes answer with: `caseReadSchema`, which `wire.ts` also
 * infers `CaseRow` from, so the document, the client's type and the runtime
 * check are one description.
 *
 * The whole-case read carries every collection key, and its rows are the loose
 * `caseOwnedRowSchema` - a strict object would strip every collection field.
 */
class CaseDto extends createZodDto(caseReadSchema) {}

/**
 * A stored row as the wire declares it: the narrowing from Drizzle's `string`
 * columns to their vocabularies, which holds because every write is parsed by
 * Zod before it lands. Asserted once here rather than at five returns.
 *
 * The schema's *input*, never `CaseRow`. `@ZodResponse` has the handler return
 * the input and the interceptor produce the output, so a stamp is still the
 * `Date` the column handed back at this point.
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
 * **Counts keyed from `CASE_COLLECTIONS`, like the document's arrays.** A
 * collection added there and forgotten here would be a rail chip with no
 * number, which reads as an empty section rather than as a missing key.
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
   * list - without the rows behind them. The whole-document route stays for
   * the screens that genuinely walk every collection: case-wide search and the
   * indicator roll-up.
   *
   * `ParseUUIDPipe` on every `caseId` below, so a malformed id is a 400 rather
   * than a driver error surfacing as a 500.
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
   * case.** The analyst chose it from a list; creating the case anyway leaves
   * them with something that looks seeded and is not, and the checklist they
   * expected is missing with nothing to say so.
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
     * **The wire says ISO, the column takes a `Date`, and this is the
     * boundary.** A coercing schema makes the case body unpublishable as JSON
     * Schema -- see `createCaseSchema.openedAt` -- so the conversion is here,
     * in one place, rather than in a validator that quietly hands the database a
     * different type than it documents.
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
   *
   * **A missing row is 404 and a moved one is 409.** Both reach here as
   * "nothing matched", and `currentVersion === null` is what separates them -
   * a 409 for a case that does not exist sends a client to merge against
   * nothing.
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
   * **No version, and no soft delete.** The client sends neither, and a case is
   * deleted from a confirmation dialog rather than edited into nonexistence -
   * the hazard a version check answers is a concurrent *field* edit, which is
   * not what makes deleting an occupied case wrong. Presence is.
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
     * **Demonstration content leaves nothing, including this line.** It
     * records no investigation, so an audit of its removal is an account of
     * something that never happened -- and the demo is reseeded on every
     * restart, so the lines accrue on an install nobody has yet used.
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
