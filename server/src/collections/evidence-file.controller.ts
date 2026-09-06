/**
 * The bytes behind an evidence row: `.../evidence/:id/file`.
 *
 * **The download URL is the client's, not a new one.** `EvidenceTable` links
 * to `GET /api/cases/{id}/evidence/{entry}/file`, and this is what answers it.
 *
 * **Attaching is its own route.** A file arriving with the row in one
 * multipart POST leaves an analyst who recorded the artefact first unable to
 * attach it at all - the Add-record dialog says so on screen. A row and its
 * bytes are two facts and arrive when they arrive.
 *
 * **The body is the file, streamed.** No multipart: a single artefact needs no
 * envelope, and `EvidenceStore.put` caps *while reading* - a parser that
 * buffered the request first would allow exactly what the cap forbids, which
 * is the store's own argument for taking a stream.
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
 *
 * **Quotes and control characters are stripped, not escaped.** The value goes
 * into a `content-disposition` header, and a filename carrying a quote splits
 * the header into something the browser reads as further parameters.
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
   *
   * **The digest is computed here and never accepted from the caller**, which
   * is what makes the stored `hash` mean anything: a hash taken on the
   * caller's word makes the verification that checks the file against it
   * circular. The column's own docstring says the same.
   *
   * **Re-attaching replaces.** The row points at one artefact; the store is
   * content-addressed, so the previous bytes stay on disk under their own
   * digest and are simply no longer referenced here.
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
   *
   * **404 for a row with no file, not an empty 200.** Most evidence is not held
   * here at all - the row records where it lives - and a zero-length download
   * reads as a corrupt artefact rather than as one this install never had.
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
    // password. Describing the artefact instead is wrong three ways at once:
    // the type, the name, and the length.
    //
    // **No `content-length`.** `row.sizeBytes` is the *plaintext* size and
    // never the container's, and it is wrong in both directions: sealing an
    // incompressible artefact makes it larger, so a client told the plaintext
    // length stops short and saves a zip with no end-of-central-directory
    // record, while a compressible one seals far smaller, so the response
    // declares a length it never sends and the client hangs until it times
    // out. Node chunks it instead, which needs no length known in advance.
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
