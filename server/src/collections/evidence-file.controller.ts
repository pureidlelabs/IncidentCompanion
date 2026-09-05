/**
 * The bytes behind an evidence row: `.../evidence/:id/file`.
 */
import {
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common'
import { Session, type UserSession } from '@thallesp/nestjs-better-auth'
import { and, eq } from 'drizzle-orm'
import type { Request, Response } from 'express'

import { CaseAccessGuard } from '../access/case-access.guard.js'
import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { EvidenceStore } from '../evidence/store.js'
import { evidence } from '../db/schema/entities.js'
import { updateVersioned } from '../db/mutate.js'
import { withCase } from '../db/scope.js'
import { CaseChannel } from '../live/case-channel.service.js'
import { Optional } from '@nestjs/common'

/**
 * What a browser should call the file it just downloaded.
 */
function dispositionName(name: string): string {
  const clean = name.replace(/["\\\r\n]/g, '').trim()
  return clean || 'attachment'
}

@UseGuards(CaseAccessGuard)
@Controller('api/cases/:caseId/evidence/:id/file')
export class EvidenceFileController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly store: EvidenceStore,
    @Optional() private readonly channel?: CaseChannel,
  ) {}

  /** The row, scoped to its case, or a 404 naming it. */
  private async rowOr404(caseId: string, id: string) {
    const [row] = await withCase(this.db, caseId, (tx) =>
      tx
        .select()
        .from(evidence)
        .where(and(eq(evidence.id, id), eq(evidence.caseId, caseId))),
    )
    if (!row) throw new NotFoundException(`No evidence ${id} in this case.`)
    return row
  }

  /**
   * Attach the request body to this row.
   */
  @Post()
  @HttpCode(200)
  async attach(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
    @Session() session: UserSession,
  ): Promise<{ hash: string; sizeBytes: number }> {
    const row = await this.rowOr404(caseId, id)

    // **The name goes in with the bytes**, so the entry inside the stored zip
    // is `invoice.eml` rather than a digest an analyst cannot act on. Content
    // addressing means the first writer's name wins for identical content -
    // the alternative is naming the entry by the digest, which is worse for
    // every download to save one edge case nobody meets.
    const sentName =
      typeof request.headers['x-original-filename'] === 'string'
        ? dispositionName(request.headers['x-original-filename'])
        : undefined
    const stored = await this.store.put(request, sentName)
    if (stored.sizeBytes === 0) {
      // **An empty attachment is a mistake, not an artefact.** It hashes and
      // stores perfectly, and the row would then claim a file nobody can read
      // anything out of.
      throw new UnprocessableEntityException({
        message: 'That file is empty. Record where the artefact is held instead.',
      })
    }

    const result = await updateVersioned(this.db, {
      table: evidence,
      entity: 'evidence',
      caseId,
      id,
      expectedVersion: row.version,
      actorId: session.user.id,
      patch: {
        hash: stored.hash,
        hashAlgorithm: stored.hashAlgorithm,
        sizeBytes: stored.sizeBytes,
        storedAt: new Date(),
        contentType: request.headers['content-type'] ?? 'application/octet-stream',
        // **The name the file had where it came from**, which the digest does
        // not say and the row would otherwise never learn.
        originalFilename: dispositionName(
          typeof request.headers['x-original-filename'] === 'string'
            ? request.headers['x-original-filename']
            : row.originalFilename,
        ),
      },
    })

    if (!result.ok) {
      throw new UnprocessableEntityException({
        message: 'Somebody else changed this evidence row while the file was uploading.',
      })
    }

    this.channel?.announce(caseId, ['evidence'], session.user.id)
    return { hash: stored.hash, sizeBytes: stored.sizeBytes }
  }

  /**
   * Stream the artefact back.
   */
  @Get()
  @Header('cache-control', 'private, no-store')
  async download(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() response: Response,
  ): Promise<void> {
    const row = await this.rowOr404(caseId, id)
    if (!row.storedAt || !row.hash) {
      throw new NotFoundException('This evidence record has no file attached.')
    }

    const stream = await this.store.open(row.hash)
    if (!stream) {
      // The row says the bytes are here and they are not: an app root moved,
      // or a file removed underneath. Saying so beats a stream that ends at
      // zero bytes and looks like an empty artefact.
      throw new NotFoundException('The attached file is missing from this install.')
    }

    // **Every header here describes the zip, not the artefact inside it.** The
    // store seals each artefact under `infected`, and `open` streams that
    // container - so the analyst saves `notes.eml.zip` and opens it with the
    // password. Describing the artefact instead was wrong three ways at once:
    // the type, the name, and the length.
    //
    // **No `content-length`.** It used to send `row.sizeBytes`, which is the
    // *plaintext* size and never the container's. Measured 2026-08-14: an
    // incompressible artefact seals ~222 bytes larger, so the client stopped
    // short and saved a zip whose end-of-central-directory record was missing;
    // a compressible one sealed to 418 bytes from 200KB, so the response
    // declared 200KB, sent 418, and the client hung until it timed out.
    // Node chunks it instead, which needs no length known in advance.
    const name = `${row.originalFilename || row.name || row.hash}.zip`
    response
      .status(200)
      // **`attachment`, never `inline`.** Evidence is routinely an artefact
      // from an incident; rendering one in the analyst's own browser is the
      // one thing this route must not offer to do.
      .setHeader('content-disposition', `attachment; filename="${dispositionName(name)}"`)
      .type('application/zip')
    stream.pipe(response)
  }
}
