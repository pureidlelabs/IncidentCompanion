/**
 * The routes for every collection whose CRUD is derived - eleven of them:
 * `db/schema/entities.ts`'s seven, plus actions, casenotes, reports and report
 * blocks.
 */
import {
  Inject,
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
import { ZodResponse, createZodDto } from 'nestjs-zod'
import { z } from 'zod'

import { CaseAccessGuard } from '../access/case-access.guard.js'

import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { withProseFlags } from './prose-flags.js'
import { CollectionService, type CollectionDefinition } from './collection.service.js'
import { ConflictsService } from './conflicts.service.js'
import {
  accounts,
  cloudApps,
  evidence,
  impact,
  malware,
  methods,
  networkIndicators,
  systems,
} from '../db/schema/entities.js'
import { reportBlocks, reports } from '../db/schema/report.js'
import { actions, caseNotes } from '../db/schema/tracker.js'
import { accountSchema } from '../domain/entities/account.js'
import { cloudAppSchema } from '../domain/entities/cloud-app.js'
import { evidenceSchema } from '../domain/entities/evidence.js'
import { impactSchema } from '../domain/entities/impact.js'
import { malwareSchema } from '../domain/entities/malware.js'
import { methodSchema } from '../domain/entities/method.js'
import { networkIndicatorSchema } from '../domain/entities/network-indicator.js'
import { systemSchema } from '../domain/entities/system.js'
import { actionSchema } from '../domain/entities/action.js'
import { caseNoteSchema } from '../domain/entities/case-note.js'
import { reportBlockSchema, reportSchema } from '../domain/entities/report.js'
import { refuseWritesToSentReport } from '../report/freeze.js'
import { caseOwnedRowSchema, patchSchema } from '../domain/field-spec.js'

/**
 * Rows one request may carry, because the door is reachable from a script:
 * high enough never to refuse an analyst, low enough that one request cannot
 * hold a transaction open over the whole table.
 */
const BULK_LIMIT = 1000

/**
 * A collection ordered by `createdAt` - an entity has no clock of its own the
 * way a timeline entry does, and the table's own sorting is client-side.
 */
export const ordered = (
  name: CollectionDefinition['name'],
  table: CollectionDefinition['table'],
): CollectionDefinition => ({
  name,
  table,
  orderBy: 'createdAt',
})

/**
 * What an entity route answers with: the envelope guaranteed and verified, the
 * collection's own fields passed through untouched.
 */
const entityRowSchema = caseOwnedRowSchema

class EntityRowDto extends createZodDto(entityRowSchema) {}
class EntityRowsDto extends createZodDto(z.array(entityRowSchema)) {}
/** The ids a create or a reorder answers with, in the order they were written. */
class CreatedIdsDto extends createZodDto(z.object({ ids: z.array(z.uuid()) })) {}

/**
 * What a reorder takes: every id in the scope, once each, in the order wanted.
 */
const reorderBodySchema = z.object({ ids: z.array(z.uuid()).max(BULK_LIMIT) }).strict()
class ReorderBodyDto extends createZodDto(reorderBodySchema) {}
/**
 * Every row a selection named comes back in exactly one of the three, so an
 * analyst can tell what happened to each without re-reading the case.
 */
class UpdatedManyDto extends createZodDto(
  z.object({
    updated: z.array(z.uuid()),
    missing: z.array(z.uuid()),
    refused: z.array(z.uuid()),
  }),
) {}
class DeletedDto extends createZodDto(z.object({ deleted: z.literal(true) })) {}

/**
 * A row out of the generic service, as the wire declares it.
 */
type CaseOwnedRow = z.input<typeof caseOwnedRowSchema>
const asRow = (row: unknown): CaseOwnedRow => row as CaseOwnedRow
const asRows = (rows: unknown[]): CaseOwnedRow[] => rows as CaseOwnedRow[]

/**
 * Reads and writes for one collection, subclassed rather than repeated per
 * collection.
 */
abstract class EntityReads {
  protected abstract readonly definition: CollectionDefinition

  /**
   * The domain schema for a row of this collection.
   */
  protected abstract readonly schema: z.ZodObject

  /**
   * **`conflicts` is optional at runtime and required by Nest.**
   */
  constructor(
    protected readonly collections: CollectionService,
    protected readonly conflicts?: ConflictsService,
  ) {}

  /** Parse or 400, with the issues Zod produced rather than a summary. */
  private parse(schema: z.ZodType, body: unknown): Record<string, unknown> {
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        message: 'Validation failed',
        errors: parsed.error.issues,
      })
    }
    return parsed.data as Record<string, unknown>
  }

  @Get()
  @ZodResponse({ status: 200, type: EntityRowsDto, description: "The collection's rows." })
  async list(@Param('caseId', ParseUUIDPipe) caseId: string) {
    return asRows(await this.collections.list(this.definition, caseId))
  }

  /**
   * **`order` and `bulk` are declared before `:id`, and the order is load-
   * bearing.**
   */
  @Post('order')
  @ZodResponse({ status: 200, type: CreatedIdsDto, description: 'The ids, in the order written.' })
  async reorder(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() body: ReorderBodyDto,
    @Session() session: UserSession,
  ) {
    const { ids } = this.parse(reorderBodySchema, body) as { ids: string[] }
    return this.collections.reorder(this.definition, caseId, ids, session.user.id)
  }

  @Post('bulk')
  @ZodResponse({ status: 201, type: CreatedIdsDto, description: 'The ids the server minted, in the order sent.' })
  async createMany(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() body: unknown,
    @Session() session: UserSession,
  ) {
    const { entries } = this.parse(
      z.object({ entries: z.array(z.unknown()).max(BULK_LIMIT) }).strict(),
      body,
    ) as { entries: unknown[] }

    // Every row against the same schema the single create uses: a batch door
    // that validated more loosely would be the way around every rule the
    // strict parse enforces.
    const rows = entries.map((entry) => this.parse(this.schema.strict(), entry))
    // **`refuse` by default, and this door keeps it.** A reference naming
    // another case is a mistake worth hearing about on an ordinary bulk add.
    // The importer passes `drop`, because a file carried in from elsewhere is
    // the one case where the link is meaningless and the row is not.
    const { ids } = await this.collections.createMany(
      this.definition,
      caseId,
      rows,
      session.user.id,
    )
    return { ids }
  }

  @Patch('bulk')
  @ZodResponse({ status: 200, type: UpdatedManyDto, description: 'Which rows took the patch, which had moved since they were read, and which were not there.' })
  async updateMany(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() body: unknown,
    @Session() session: UserSession,
  ) {
    /**
     * **A selection names each row with the version it was read at**, because a
     * bulk patch carries the same version check a single patch does.
     */
    const parsed = this.parse(
      z
        .object({
          ids: z
            .array(z.object({ id: z.uuid(), version: z.int().nonnegative() }).strict())
            .max(BULK_LIMIT),
          fields: z.record(z.string(), z.unknown()),
        })
        .strict(),
      body,
    ) as { ids: { id: string; version: number }[]; fields: Record<string, unknown> }

    const fields = this.parse(patchSchema(this.schema), parsed.fields)
    if (Object.keys(fields).length === 0) {
      throw new UnprocessableEntityException({ message: 'A patch has to change something.' })
    }
    return this.collections.updateMany(
      this.definition,
      caseId,
      parsed.ids,
      fields,
      session.user.id,
    )
  }

  @Get(':id')
  @ZodResponse({ status: 200, type: EntityRowDto, description: 'One row.' })
  async get(@Param('caseId', ParseUUIDPipe) caseId: string, @Param('id', ParseUUIDPipe) id: string) {
    const row = await this.collections.get(this.definition, caseId, id)
    // Belt-and-braces: `CollectionService.get` throws its own 404 first, so
    // this fires only if that changes. Its wording differs from the service's,
    // which is why the sentence an analyst meets is not this one.
    // -> `reads-404.test.ts`
    if (row === undefined) {
      throw new NotFoundException(`No ${this.definition.name} ${id} in this case.`)
    }
    return asRow(row)
  }

  // `async`, so a refused body rejects rather than throwing synchronously.
  // Nest handles both; a caller awaiting the promise does not.
  @Post()
  @ZodResponse({ status: 201, type: EntityRowDto, description: 'The row as stored.' })
  async create(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() body: unknown,
    @Session() session: UserSession,
  ) {
    const values = this.parse(this.schema.strict(), body)
    return asRow(await this.collections.create(this.definition, caseId, values, session.user.id))
  }

  /**
   * **`version` is the caller's, and it is not part of the patch.**
   */
  @Patch(':id')
  @ZodResponse({ status: 200, type: EntityRowDto, description: 'The row as stored after the patch.' })
  async update(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Session() session: UserSession,
  ) {
    /**
     * **`base` rides with the patch and is not part of it.**
     */
    const {
      version,
      base,
      ...rest
    } = (body ?? {}) as { version?: unknown; base?: unknown } & Record<string, unknown>
    if (!Number.isInteger(version)) {
      throw new UnprocessableEntityException({ message: 'A patch has to name the version it read.' })
    }
    const patch = this.parse(patchSchema(this.schema), rest)
    if (Object.keys(patch).length === 0) {
      throw new UnprocessableEntityException({ message: 'A patch has to change something.' })
    }

    const result = await this.collections.update(
      this.definition,
      caseId,
      id,
      version as number,
      patch,
      session.user.id,
    )
    if (result.ok) return asRow(result.row)

    /**
     * **A row that is not in this case is 404, and nothing is recorded.**
     * Both arrive here as "nothing matched", and `currentVersion === null` is
     * what separates them - the refusal re-reads the row to report it, and a
     * row the case-scoped read cannot see has no version to report.
     *
     * Answering 409 was wrong twice over. It sends a client off to merge
     * against a row it cannot see, and - worse - the recording below then
     * writes a conflict into *this* case naming another case's row id and the
     * patch aimed at it, which is a leak across the boundary row-level
     * security exists to hold. Found by an end-to-end oracle that addresses
     * a write to the wrong case on purpose.
     */
    if (result.currentVersion === null) {
      throw new NotFoundException(`No ${this.definition.name} ${id} in this case.`)
    }

    /**
     * **The refused edit is kept before the refusal is thrown.**
     */
    if (this.conflicts) {
      await this.conflicts.record({
        caseId,
        userId: session.user.id,
        entity: this.definition.name,
        entityId: id,
        base: (base ?? {}) as Record<string, unknown>,
        mine: patch,
      })
    }

    // The version it actually reached, because the caller's next move is a
    // merge review and they cannot word one without knowing what it became.
    throw new ConflictException({
      message: 'Someone else wrote this first.',
      currentVersion: result.currentVersion,
    })
  }

  @Delete(':id')
  @ZodResponse({ status: 200, type: DeletedDto, description: 'The row is gone.' })
  async remove(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('version') version: string,
    @Session() session: UserSession,
  ) {
    const expected = Number(version)
    if (!Number.isInteger(expected)) {
      throw new UnprocessableEntityException({ message: 'A delete has to name the version it read.' })
    }
    const removed = await this.collections.remove(
      this.definition,
      caseId,
      id,
      expected,
      session.user.id,
    )
    if (!removed) throw new ConflictException({ message: 'Someone else wrote this first.' })
    return { deleted: true } as const
  }
}

@UseGuards(CaseAccessGuard)
@Controller('api/cases/:caseId/systems')
export class SystemsController extends EntityReads {
  constructor(collections: CollectionService, conflicts?: ConflictsService) {
    super(collections, conflicts)
  }

  protected readonly definition = ordered('systems', systems)
  protected readonly schema = systemSchema
}

@UseGuards(CaseAccessGuard)
@Controller('api/cases/:caseId/accounts')
export class AccountsController extends EntityReads {
  constructor(collections: CollectionService, conflicts?: ConflictsService) {
    super(collections, conflicts)
  }

  protected readonly definition = ordered('accounts', accounts)
  protected readonly schema = accountSchema
}

@UseGuards(CaseAccessGuard)
@Controller('api/cases/:caseId/malware')
export class MalwareController extends EntityReads {
  constructor(collections: CollectionService, conflicts?: ConflictsService) {
    super(collections, conflicts)
  }

  protected readonly definition = ordered('malware', malware)
  protected readonly schema = malwareSchema
}

@UseGuards(CaseAccessGuard)
@Controller('api/cases/:caseId/network_indicators')
export class NetworkIndicatorsController extends EntityReads {
  constructor(collections: CollectionService, conflicts?: ConflictsService) {
    super(collections, conflicts)
  }

  protected readonly definition = ordered('network_indicators', networkIndicators)
  protected readonly schema = networkIndicatorSchema
}

@UseGuards(CaseAccessGuard)
@Controller('api/cases/:caseId/impact')
export class ImpactController extends EntityReads {
  constructor(collections: CollectionService, conflicts?: ConflictsService) {
    super(collections, conflicts)
  }

  protected readonly definition = ordered('impact', impact)
  protected readonly schema = impactSchema
}

@UseGuards(CaseAccessGuard)
@Controller('api/cases/:caseId/cloud_apps')
export class CloudAppsController extends EntityReads {
  constructor(collections: CollectionService, conflicts?: ConflictsService) {
    super(collections, conflicts)
  }

  protected readonly definition = ordered('cloud_apps', cloudApps)
  protected readonly schema = cloudAppSchema
}

@UseGuards(CaseAccessGuard)
@Controller('api/cases/:caseId/evidence')
export class EvidenceController extends EntityReads {
  constructor(collections: CollectionService, conflicts?: ConflictsService) {
    super(collections, conflicts)
  }

  protected readonly definition = ordered('evidence', evidence)
  protected readonly schema = evidenceSchema
}

/**
 * How a finding was obtained - one row per act, referenced from wherever the
 * act established something.
 */
@UseGuards(CaseAccessGuard)
@Controller('api/cases/:caseId/methods')
export class MethodsController extends EntityReads {
  constructor(collections: CollectionService, conflicts?: ConflictsService) {
    super(collections, conflicts)
  }

  protected readonly definition = ordered('methods', methods)
  protected readonly schema = methodSchema
}

@UseGuards(CaseAccessGuard)
@Controller('api/cases/:caseId/actions')
export class ActionsController extends EntityReads {
  constructor(collections: CollectionService, conflicts?: ConflictsService) {
    super(collections, conflicts)
  }

  protected readonly definition = ordered('actions', actions)
  protected readonly schema = actionSchema
}

@UseGuards(CaseAccessGuard)
@Controller('api/cases/:caseId/casenotes')
export class CaseNotesController extends EntityReads {
  constructor(collections: CollectionService, conflicts?: ConflictsService) {
    super(collections, conflicts)
  }

  protected readonly definition = ordered('casenotes', caseNotes)
  protected readonly schema = caseNoteSchema
}

/**
 * A sent report is closed to every write, its own row and its sections alike.
 */
export const REPORTS_COLLECTION: CollectionDefinition = {
  ...ordered('reports', reports),
  refuseIfClosed: refuseWritesToSentReport('id'),
}

export const REPORT_BLOCKS_COLLECTION: CollectionDefinition = {
  name: 'report_blocks',
  // Blocks are ordered inside their own report, which is what the
  // `(reportId, position)` index says.
  position: 'position',
  orderWithin: 'reportId',
  table: reportBlocks,
  orderBy: 'position',
  /**
   * Supplied, because `COLLECTION_SCHEMAS` does not carry this one - without
   * it the reference check resolves `undefined` and returns, leaving a
   * figure's `evidenceId` free to name another case's row.
   */
  schemaFor: () => reportBlockSchema,
  refuseIfClosed: refuseWritesToSentReport('reportId'),
}

/**
 * A case's reports, and the blocks they are made of - ordinary collections.
 * The lifecycle verbs (send, freeze) and the painters live in `report/`.
 */
@UseGuards(CaseAccessGuard)
@Controller('api/cases/:caseId/reports')
export class ReportsController extends EntityReads {
  constructor(collections: CollectionService, conflicts?: ConflictsService) {
    super(collections, conflicts)
  }

  protected readonly definition = REPORTS_COLLECTION
  protected readonly schema = reportSchema
}

@UseGuards(CaseAccessGuard)
@Controller('api/cases/:caseId/report_blocks')
export class ReportBlocksController extends EntityReads {
  constructor(
    collections: CollectionService,
    conflicts?: ConflictsService,
    @Inject(DATABASE) private readonly db?: Database,
  ) {
    super(collections, conflicts)
  }

  /**
   * Each block, and whether anybody has written in it.
   */
  @Get()
  @ZodResponse({ status: 200, type: EntityRowsDto, description: 'Report blocks, each with whether it holds prose.' })
  override async list(@Param('caseId', ParseUUIDPipe) caseId: string) {
    const rows = (await this.collections.list(this.definition, caseId)) as Record<
      string,
      unknown
    >[]
    if (!this.db) return asRows(rows)

    // **Through `withProseFlags`, which reads the reports inside the case
    // scope.** Read on the bare handle, row-level security refuses every one
    // of them and each block comes back empty however much is in it.
    return asRows(await withProseFlags(this.db, caseId, rows))
  }

  protected readonly definition = REPORT_BLOCKS_COLLECTION
  protected readonly schema = reportBlockSchema
}

export const ENTITY_CONTROLLERS = [
  SystemsController,
  AccountsController,
  MalwareController,
  NetworkIndicatorsController,
  ImpactController,
  CloudAppsController,
  EvidenceController,
  MethodsController,
  ActionsController,
  CaseNotesController,
  ReportsController,
  ReportBlocksController,
]
