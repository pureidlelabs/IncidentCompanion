/**
 * The timeline's routes.
 *
 * **A controller per collection, one service under all of them.** Nest resolves
 * routes from decorators at class level, so a single dynamic controller would
 * have to be built at runtime and would lose the OpenAPI document. This file
 * is a definition, four handlers and no logic.
 *
 * **A refused write is a 409 carrying the version the row actually reached**,
 * which is what a merge review needs to tell the analyst what they were about
 * to write over.
 */
import {
  UnprocessableEntityException,
  Body,
  ConflictException,
  NotFoundException,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { Session, type UserSession } from '@thallesp/nestjs-better-auth'
import { ZodResponse, ZodValidationPipe, createZodDto } from 'nestjs-zod'
import { z } from 'zod'

import { CaseAccessGuard } from '../access/case-access.guard.js'
import { CollectionService, type CollectionDefinition } from './collection.service.js'
import { ConflictsService } from './conflicts.service.js'
import { timeline } from '../db/schema/timeline.js'
import {
  actionSchema,
  eventSchema,
  actionWriteSchema,
  eventWriteSchema,
  timelineRowSchema,
  timelineToWire,
  timelineWriteSchema,
} from '../domain/entities/timeline.js'
import { patchSchema } from '../domain/field-spec.js'
import type { TimelineRow } from '../domain/wire.js'

/**
 * **Exported because the import door writes timeline rows too.** Rebuilding it
 * by hand there dropped `schemaFor`, and with it the reference check on every
 * analyst edit to an imported entry -- `COLLECTION_SCHEMAS` carries no
 * `timeline` entry on purpose, so the check resolves nothing and returns.
 */
export const DEFINITION: CollectionDefinition = {
  name: 'timeline',
  table: timeline,
  /** Its own clock, not insertion order - the story is what the analyst reads. */
  orderBy: 'time',
  /**
   * **The only collection that has to answer this**, because its schema is a
   * union and the arm depends on the row's `kind`. An event and an action
   * offer different references - an action has no source host - so checking
   * against the wrong arm would either miss a field or invent one.
   *
   * A patch carries no `kind`, so the event arm is the fallback: it is the
   * wider of the two, and checking a reference an action cannot have costs a
   * lookup that finds nothing to complain about.
   */
  schemaFor: (values) => (values['kind'] === 'action' ? actionSchema : eventSchema),
}

/**
 * **A pipe, not a `createZodDto` class.** A DTO class extends the schema's
 * inferred type, and a discriminated union is not an object type - TS2509,
 * "not an object type or intersection with statically known members". The pipe
 * takes the schema directly and validates the same way; what is lost is the
 * class Nest's OpenAPI plugin would have read, which `/api/specs` already
 * serves from the same schema.
 */
const validateEntry = new ZodValidationPipe(timelineWriteSchema)

const BULK_LIMIT = 1000

const bulkBodySchema = z.object({ entries: z.array(z.unknown()).max(BULK_LIMIT) }).strict()
class CreatedIdsDto extends createZodDto(z.object({ ids: z.array(z.uuid()) })) {}

/**
 * What the server asserts about a row it was handed by an importer.
 *
 * **Exported because two doors write imported entries** -- this controller's
 * bulk route and `incident-import`'s commit -- and a stamp duplicated in both
 * is one that drifts. A caller able to assert `imported` could forge an
 * evidentiary claim, which is why the write schemas omit both fields.
 */
export const IMPORTED_STAMP = { provenance: 'imported' as const, unreviewed: true }

/** A refusal the API answers as 422, the way `ZodValidationPipe` does. */
function parsed(schema: z.ZodType, body: unknown): Record<string, unknown> {
  const answer = schema.safeParse(body)
  if (!answer.success) {
    throw new UnprocessableEntityException({ message: 'Validation failed', errors: answer.error.issues })
  }
  return answer.data as Record<string, unknown>
}

/**
 * When an entry happened, and whether the server had to decide that.
 *
 * **`timeAssumed` is the server's conclusion and only the server may write
 * it** - it is in `OWNED`, so a caller naming it is refused.
 *
 * **Absent and `''` are one case**: no time was given, so the entry goes at
 * now and carries the flag that keeps it out of the gap queue and puts the
 * dashed underline under it.
 */
function whenItHappened(value: string | undefined): { time: Date; timeAssumed: boolean } {
  const given = typeof value === 'string' && value !== ''
  return { time: given ? new Date(value) : new Date(), timeAssumed: !given }
}

/**
 * A patch body per kind: **`patchSchema`, never `.partial()`, and strict.**
 *
 * Per kind because an activity has no severity and a union cannot discriminate
 * on a body that does not restate `kind`; strict because an unknown key here
 * is how `provenance`, `caseId` and `createdBy` were once writable.
 *
 * **`kind` is not patchable.** An event does not become an activity - the
 * fields that make it one would be left behind. Delete and rewrite.
 */
const PATCH_SCHEMAS = {
  event: patchSchema(eventWriteSchema.omit({ kind: true })),
  action: patchSchema(actionWriteSchema.omit({ kind: true })),
} as const

/** Only `version` is validated by the pipe; the rest needs the row's kind. */
const versionSchema = z.object({ version: z.int().nonnegative() }).catchall(z.unknown())
const validatePatch = new ZodValidationPipe(versionSchema)

/**
 * What the timeline routes answer with: `timelineRowSchema`, never a shape
 * written here - the same one `timelineToWire` produces, so the document, the
 * compiler and the runtime interceptor read one description.
 *
 * **Assigned, not `extends`.** A timeline row is a discriminated union, and a
 * class cannot extend one - `createZodDto` builds a class whose members have to
 * be statically known, which a union's are not (TS2509). The value it returns
 * works the same either way; only the `class X extends` sugar is unavailable.
 */
const TimelineRowDto = createZodDto(timelineRowSchema)
const TimelineRowsDto = createZodDto(z.array(timelineRowSchema))
class DeletedDto extends createZodDto(z.object({ deleted: z.literal(true) })) {}

/**
 * **Guarded at the class**, so a handler added later cannot forget it - the
 * same reason the auth guard is global rather than per route.
 */
@UseGuards(CaseAccessGuard)
@Controller('api/cases/:caseId/timeline')
export class TimelineController {
  constructor(
    private readonly collections: CollectionService,
    private readonly conflicts?: ConflictsService,
  ) {}

  /**
   * **Projected onto its kind on the way out.** The table holds events and
   * actions together, so the query returns every column and an action would
   * otherwise ship the event-only fields - and the client's
   * `kind` check would be a convention rather than something the type enforces.
   * -> `domain/entities/timeline.ts`
   */
  @Get()
  @ZodResponse({ status: 200, type: TimelineRowsDto, description: "The case's timeline, oldest first." })
  async list(@Param('caseId', ParseUUIDPipe) caseId: string): Promise<TimelineRow[]> {
    const rows = await this.collections.list(DEFINITION, caseId)
    return rows.map((row) => timelineToWire(row as Record<string, unknown>) as TimelineRow)
  }

  @Get(':id')
  @ZodResponse({ status: 200, type: TimelineRowDto, description: 'One entry, projected onto its kind.' })
  async get(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TimelineRow> {
    const row = await this.collections.get(DEFINITION, caseId, id)
    if (row === undefined) throw new NotFoundException(`No timeline entry ${id} in this case.`)
    return timelineToWire(row as Record<string, unknown>) as TimelineRow
  }

  /**
   * **Answered through the same projection as the reads.** `ukcPhase` and
   * `ukcCycle` are derived on the way out and are not columns, so a raw row
   * carries them as null - and a client that puts the answer straight into its
   * cache blanks the kill-chain column of the row just written. Measured
   * 2026-08-10: the list said `delivery`/`in`, the write answered null/null,
   * and the list said `delivery`/`in` again on the next fetch. Nothing was
   * lost; the *response* was wrong, which is the harder kind to notice.
   */
  @Post()
  @ZodResponse({ status: 201, type: TimelineRowDto, description: 'The entry as stored, with its derived phase.' })
  async create(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body(validateEntry) body: unknown,
    @Session() session: UserSession,
  ): Promise<TimelineRow> {
    // `time` arrives as an ISO string because the schema is also the API
    // document, and JSON Schema has no date type; the column wants a Date.
    const { time, ...rest } = body as { time?: string } & Record<string, unknown>
    const row = await this.collections.create(
      DEFINITION,
      caseId,
      { ...rest, ...whenItHappened(time) },
      session.user.id,
    )
    return timelineToWire(row as Record<string, unknown>) as TimelineRow
  }

  /**
   * Write many entries at once, in the order sent.
   *
   * **Declared before `:id` is not enough here** -- `bulk` is a `@Post` and
   * `:id` is not, so they cannot collide. It sits beside the single create
   * because the two share every rule: the same strict schema per row, and the
   * same `time` conversion, since JSON Schema has no date type.
   *
   * **`refuse` on a foreign reference, as the entity door does.** The importer
   * that drives this builds its entities first and maps their new ids into the
   * entries, so a reference naming another case is a mistake rather than the
   * cost of carrying a file in from elsewhere.
   */
  @Post('bulk')
  @ZodResponse({
    status: 201,
    type: CreatedIdsDto,
    description: 'The ids the server minted, in the order sent.',
  })
  async createMany(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() body: unknown,
    @Session() session: UserSession,
  ): Promise<{ ids: string[] }> {
    const { entries } = parsed(bulkBodySchema, body) as { entries: unknown[] }
    // Every row against the schema the single create uses. A batch door that
    // validated more loosely would be the way around every rule it enforces --
    // and through `parsed`, so a refused row answers 422 like the single write
    // rather than a raw `ZodError` the filter turns into a 500. Caught by
    // `test/timeline-bulk.test.ts`, which drives the route rather than the
    // method.
    const rows = entries.map((entry) => {
      const { time, ...rest } = parsed(timelineWriteSchema, entry) as { time?: string } & Record<
        string,
        unknown
      >
      return {
        ...rest,
        ...whenItHappened(time),
        // **Stamped by the server, because the schema will not take them from a
        // caller.** `provenance` and `unreviewed` are in `OWNED`, so the strict
        // write schema refuses a row that asserts either -- which is what
        // refused every row the Sentinel importer sent, since the client
        // stamped them itself on the argument that nothing downstream would.
        // This is that downstream. A caller able to claim `imported` is the
        // reason the omission exists.
        ...IMPORTED_STAMP,
      }
    })

    const { ids } = await this.collections.createMany(DEFINITION, caseId, rows, session.user.id)
    return { ids }
  }

  @Patch(':id')
  @ZodResponse({ status: 200, type: TimelineRowDto, description: 'The entry as stored after the patch.' })
  async update(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validatePatch) body: unknown,
    @Session() session: UserSession,
  ) {
    // `base` rides with the patch and is not part of it - see the entity
    // controller. Stripped here too, or the per-kind strict schema refuses the
    // whole save as naming a column the timeline does not have.
    const { version, base, ...raw } = body as {
      version: number
      base?: Record<string, unknown>
    } & Record<string, unknown>

    // The row's kind decides which fields are patchable, so it is read before
    // the patch is validated. The version check still guards the write itself:
    // a kind cannot change, so a race here cannot pick the wrong schema.
    const existing = (await this.collections.get(DEFINITION, caseId, id)) as { kind: 'event' | 'action' }
    const parsed = PATCH_SCHEMAS[existing.kind].safeParse(raw)
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        message: 'Validation failed',
        errors: parsed.error.issues,
      })
    }
    if (Object.keys(parsed.data).length === 0) {
      throw new UnprocessableEntityException({ message: 'A patch has to change something.' })
    }

    const patch = parsed.data
    // Same rule as create, or clearing a time on an existing row writes an
    // Invalid Date and the column refuses it.
    if ('time' in patch) Object.assign(patch, whenItHappened(patch['time'] as string | undefined))

    const result = await this.collections.update(
      DEFINITION,
      caseId,
      id,
      version,
      patch,
      session.user.id,
    )
    // Projected like the reads: a raw row carries the derived kill-chain
    // fields as null, and the client caches what a write answers.
    if (result.ok) return timelineToWire(result.row) as TimelineRow

    // Kept before the refusal is thrown: these values exist nowhere else once
    // this response is sent.
    await this.conflicts?.record({
      caseId,
      userId: session.user.id,
      entity: DEFINITION.name,
      entityId: id,
      base: base ?? {},
      mine: patch,
    })

    // **409 with the current version**, because the caller's next move is a
    // merge review rather than a retry - and it cannot word one without
    // knowing what the row became.
    throw new ConflictException({
      message: 'Someone else wrote this first.',
      currentVersion: result.currentVersion,
    })
  }

  @Delete(':id')
  @ZodResponse({ status: 200, type: DeletedDto, description: 'The entry is gone.' })
  async remove(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('version') version: string,
    @Session() session: UserSession,
  ) {
    const expected = Number(version)
    if (!Number.isInteger(expected)) {
      throw new ConflictException({ message: 'A delete has to name the version it read.' })
    }
    const removed = await this.collections.remove(
      DEFINITION,
      caseId,
      id,
      expected,
      session.user.id,
    )
    if (!removed) {
      throw new ConflictException({ message: 'Someone else wrote this first.' })
    }
    return { deleted: true } as const
  }
}
