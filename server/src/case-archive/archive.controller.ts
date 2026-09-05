/**
 * `POST /api/cases/{id}/archive` and `POST /api/cases/import`.
 */
import { ApiBody } from '@nestjs/swagger'
import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common'
import { ZodResponse, createZodDto } from 'nestjs-zod'
import { Session, type UserSession } from '@thallesp/nestjs-better-auth'
import type { Request, Response } from 'express'
import { z } from 'zod'

import { CaseAccessGuard } from '../access/case-access.guard.js'
import { ArchiveExportService } from './export.service.js'
import {
  ArchiveImportService,
  importResultSchema,
  type ImportResult,
} from './import.service.js'
import { BadArchive, MAX_TOTAL_BYTES } from '../archive/format.js'
import { MIN_PASSPHRASE_CHARS, WeakPassphrase } from '../archive/envelope.js'

const exportSchema = z
  .object({
    passphrase: z.string().default(''),
    /**
     * **Defaulting to true, which is the analyst's own default.** An archive is
     * usually a backup; a handover is the deliberate act, and the screen asks.
     */
    includeFiles: z.boolean().default(true),
  })
  .strict()

class ArchiveOptionsDto extends createZodDto(exportSchema) {}

class ImportResultDto extends createZodDto(importResultSchema) {}

@Controller('api')
export class ArchiveController {
  constructor(
    private readonly exports: ArchiveExportService,
    private readonly imports: ArchiveImportService,
  ) {}

  @UseGuards(CaseAccessGuard)
  @Post('cases/:caseId/archive')
  @ApiBody({ type: ArchiveOptionsDto, description: 'How to build the archive: an optional passphrase, and whether to carry the evidence bytes.' })
  @HttpCode(200)
  async export(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() body: unknown,
    @Res() response: Response,
  ): Promise<void> {
    const parsed = exportSchema.safeParse(body ?? {})
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        message: parsed.error.issues.map((one) => one.message).join(' '),
      })
    }
    const { passphrase, includeFiles } = parsed.data
    if (passphrase && passphrase.length < MIN_PASSPHRASE_CHARS) {
      // Answered here as well as in `seal`, so the analyst gets the specific
      // refusal rather than a generic failure from inside the envelope.
      throw new UnprocessableEntityException({
        message: `A passphrase needs at least ${String(MIN_PASSPHRASE_CHARS)} characters.`,
      })
    }

    let built
    try {
      built = await this.exports.build({ caseId, passphrase, includeFiles })
    } catch (error) {
      if (error instanceof WeakPassphrase) {
        throw new UnprocessableEntityException({ message: error.message })
      }
      throw error
    }

    response
      .status(200)
      .type('application/octet-stream')
      .setHeader('content-disposition', `attachment; filename="${built.filename}"`)
      // **What the archive does not carry, in a header rather than the body.**
      // The body is the file; a caller that needs to tell the analyst an
      // artefact was missing cannot parse a zip to find out.
      .setHeader('x-archive-attachments', built.attachments)
      .setHeader('x-archive-omitted', String(built.omitted.length))
      .send(built.bytes)
  }

  /**
   * **The body is the archive**, for the same reason an evidence upload's is:
   * there is one file and no envelope to parse, and the ceiling has to apply
   * while reading rather than to a buffer already in memory.
   */
  @Post('cases/import')
  @ZodResponse({
    status: 201,
    type: ImportResultDto,
    description: 'The case the archive became, and what came with it.',
  })
  @HttpCode(201)
  async import(
    @Req() request: Request,
    @Session() session: UserSession,
  ): Promise<ImportResult> {
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of request as AsyncIterable<Buffer>) {
      size += chunk.length
      if (size > MAX_TOTAL_BYTES) {
        throw new UnprocessableEntityException({
          message: `An archive is at most ${String(MAX_TOTAL_BYTES / 1024 / 1024)}MB.`,
        })
      }
      chunks.push(chunk)
    }
    if (size === 0) {
      throw new UnprocessableEntityException({ message: 'That file is empty.' })
    }

    const passphrase = request.headers['x-archive-passphrase']
    try {
      return await this.imports.load(
        Buffer.concat(chunks),
        typeof passphrase === 'string' ? passphrase : '',
        session.user.id,
      )
    } catch (error) {
      if (error instanceof BadArchive) {
        throw new UnprocessableEntityException({ message: error.message })
      }
      throw error
    }
  }
}
