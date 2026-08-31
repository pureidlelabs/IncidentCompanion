/**
 * `GET`/`PATCH /api/cases/:caseId/compliance` - the case's regulatory record,
 * a resource of its own guarded by its own version.
 *
 * `GET .../compliance/verdict` is a second route on purpose: it is derived
 * over three lenses and the install's regime switches, so it changes with a
 * setting as well as with a field, and the two cache differently.
 */
import { ApiBody } from '@nestjs/swagger'
import {
  UnprocessableEntityException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common'
import { Session, type UserSession } from '@thallesp/nestjs-better-auth'

import { CaseAccessGuard } from '../access/case-access.guard.js'

import { ComplianceService, type ComplianceRow } from './compliance.service.js'
import type { Verdict } from './verdict.js'
import { patchComplianceSchema } from './compliance.dto.js'
import { z } from 'zod'
import { ZodResponse, createZodDto } from 'nestjs-zod'
import { caseComplianceSchema } from '../domain/entities/case-compliance.js'
import { verdictSchema } from './verdict.js'

/**
 * What a caller is promised, which is the record plus the two fields it needs
 * to write back: the case it belongs to and the version to present.
 *
 * **Narrower than the row on purpose.** The stored row also carries the
 * timestamps and the attribution columns; the client reads neither, and
 * publishing a timestamp would mean `z.date()` - which `toJSONSchema` refuses -
 * or a conversion for a field with no reader.
 */
export const complianceRecordSchema = caseComplianceSchema.extend({
  caseId: z.uuid(),
  version: z.number().int().describe('Present this on the next patch, or it is refused.'),
})

export type ComplianceRecord = z.infer<typeof complianceRecordSchema>

class ComplianceRecordDto extends createZodDto(complianceRecordSchema) {}
class VerdictsDto extends createZodDto(z.object({ regimes: z.array(verdictSchema) })) {}

/**
 * The stored row as the reference publishes it.
 *
 * **Parsed rather than cast.** The row's columns are `string | null` where the
 * schema closes a vocabulary, so a cast would publish a promise nothing checks.
 * A value outside the enum fails here - at the door, naming the field - instead
 * of reaching a client that trusted the document.
 */
function published(row: ComplianceRow): ComplianceRecord {
  return complianceRecordSchema.parse(row)
}

/**
 * What a compliance patch accepts: the fields being answered, and the version
 * the analyst read.
 *
 * Documented rather than validated as one schema - the handler splits the
 * version off and refuses each half with its own sentence, which is copy an
 * analyst can act on where a validation tree is not.
 */
const compliancePatchSchema = patchComplianceSchema.extend({
  version: z.number().int().describe('The version this analyst read. A stale one is refused with 409.'),
})

class CompliancePatchDto extends createZodDto(compliancePatchSchema) {}

/**
 * **The guard is on the class and the parameter is `caseId`, and those are one
 * decision.** The guard reads `caseId` and nothing else, so a route spelling it
 * `:id` - which these three did - is unguarded whether or not the decorator is
 * present. Every route here is case-scoped, so the class carries it.
 */
@Controller('api')
@UseGuards(CaseAccessGuard)
export class ComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  @Get('cases/:caseId/compliance')
  @ZodResponse({
    status: 200,
    type: ComplianceRecordDto,
    description: 'The regulatory record kept for this case.',
  })
  async read(@Param('caseId', ParseUUIDPipe) id: string): Promise<ComplianceRecord> {
    return published(await this.compliance.read(id))
  }

  /**
   * The per-article determination.
   *
   * **Declared before the record's PATCH and after its GET is irrelevant, but
   * the path order is not**: `cases/:caseId/compliance/verdict` is a longer
   * path than `cases/:caseId/compliance`, so Nest matches it exactly and neither
   * shadows the other. The client's stub had to be ordered the other way,
   * which is where that trap actually bites.
   */
  @Get('cases/:caseId/compliance/verdict')
  @ZodResponse({
    status: 200,
    type: VerdictsDto,
    description: 'What each regime concludes from what the case records.',
  })
  async verdict(@Param('caseId', ParseUUIDPipe) id: string): Promise<{ regimes: Verdict[] }> {
    return { regimes: await this.compliance.verdict(id) }
  }

  /**
   * **`version` is the caller's and is not part of the patch**, and a missing
   * row is 404 where a moved one is 409 - the same contract every other row in
   * the case answers, so a client needs no special case for this one.
   */
  @Patch('cases/:caseId/compliance')
  @ApiBody({ type: CompliancePatchDto, description: 'The answers being written, and the version read.' })
  @ZodResponse({
    status: 200,
    type: ComplianceRecordDto,
    description: 'The record as it now stands, carrying the version the next patch must present.',
  })
  async patch(
    @Param('caseId', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Session() session: UserSession,
  ): Promise<ComplianceRecord> {
    const { version, ...rest } = (body ?? {}) as { version?: unknown } & Record<string, unknown>
    if (!Number.isInteger(version)) {
      throw new UnprocessableEntityException({ message: 'A patch has to name the version it read.' })
    }

    const parsed = patchComplianceSchema.safeParse(rest)
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        message: 'Validation failed',
        errors: z.treeifyError(parsed.error),
      })
    }
    if (Object.keys(parsed.data).length === 0) {
      throw new UnprocessableEntityException({ message: 'A patch has to change something.' })
    }

    const result = await this.compliance.patch(
      id,
      version as number,
      parsed.data,
      session.user.id,
    )
    if (result.ok) return published(result.row)
    if (result.currentVersion === null) {
      throw new NotFoundException(`No compliance record for case ${id}.`)
    }

    throw new ConflictException({
      message: 'Someone else wrote this first.',
      currentVersion: result.currentVersion,
    })
  }
}
