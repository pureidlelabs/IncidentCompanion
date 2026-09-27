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
  ConflictException,
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
import { release } from '../report/artefacts-named.js'
import { evidence } from '../db/schema/entities.js'
import { updateVersioned } from '../db/mutate.js'
import { withCase } from '../db/scope.js'
import { CaseChannel } from '../live/case-channel.service.js'
import { Optional } from '@nestjs/common'
import { contentDisposition, safeFilename } from '../domain/disposition.js'

/**
 * The name a caller sent, as the analyst chose it.
 *
 * Percent-decoded, because that is how the client sends it; a value that does
 * not decode is taken as it arrived.
 */
function sentFilename(name: string): string {
  let decoded = name
  try {
    decoded = decodeURIComponent(name)
  } catch {
    // A malformed escape sequence: an ordinary per cent sign in a filename.
  }
  if (decoded.length > 255) {
    throw new UnprocessableEntityException({ message: 'x-original-filename is longer than 255 characters.' })
  }
  return safeFilename(decoded) || 'attachment'
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
   * **Re-attaching replaces.** The row points at one artefact; the previous
   * bytes leave the case unless something else in it still names them.
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
    // is `invoice.eml` rather than a digest an analyst cannot act on. Within a
    // case the first writer's name wins for identical content.
    const sentName =
      typeof request.headers['x-original-filename'] === 'string'
        ? sentFilename(request.headers['x-original-filename'])
        : undefined
    const stored = await this.store.seal(request, sentName)
    if (stored.sizeBytes === 0) {
      // **An empty attachment is a mistake, not an artefact.** It hashes and
      // stores perfectly, and the row would then claim a file nobody can read
      // anything out of.
      throw new UnprocessableEntityException({
        message: 'That file is empty. Record where the artefact is held instead.',
      })
    }

    // Held from the bytes landing to the row naming them, so a removal in this
    // case never finds them named by nothing.
    return this.store.exclusive(caseId, async () => {
      await this.store.keep(caseId, stored)
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
          originalFilename: sentName ?? row.originalFilename,
        },
      })

      // What the row stopped naming, or what it never came to name.
      await release(this.db, this.store, caseId, [result.ok ? row.hash : stored.hash])

      if (!result.ok) {
        // The row moved while the bytes arrived, which is somebody having
        // written first rather than a body this route would not take - so 409
        // with the version, like every other versioned write.
        if (result.currentVersion === null) {
          throw new NotFoundException(`No evidence ${id} in this case.`)
        }
        throw new ConflictException({
          message: 'Someone else wrote this first.',
          currentVersion: result.currentVersion,
        })
      }

      this.channel?.announce(caseId, ['evidence'])
      return { hash: stored.hash, sizeBytes: stored.sizeBytes }
    })
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

    const stream = await this.store.open(caseId, row.hash)
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
      .setHeader('content-disposition', contentDisposition('attachment', name))
      .type('application/zip')
    stream.pipe(response)
  }
}
