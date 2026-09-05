/**
 * A case, out, as a `.iccase`.
 */
import { Inject, Injectable, Logger } from '@nestjs/common'

import { textOf } from '../domain/text-of.js'
import { CasesService } from '../cases/cases.service.js'
import { EvidenceStore } from '../evidence/store.js'
import {
  CASE_NAME,
  EVIDENCE_PREFIX,
  PROSE_PREFIX,
  pack,
  type Attachments,
} from '../archive/format.js'
import { seal } from '../archive/envelope.js'

export interface ExportRequest {
  caseId: string
  /** Empty for a plain zip. Encryption is opt-in per export, not a mode. */
  passphrase?: string
  includeFiles: boolean
}

export interface ExportedArchive {
  bytes: Buffer
  filename: string
  attachments: Attachments
  /** What was left out and why, so the caller can say so rather than guess. */
  omitted: string[]
}

/** A filename a browser will accept and a human can recognise. */
function archiveName(reference: string, title: string, id: string): string {
  const stem = (reference || title || id).replace(/[^A-Za-z0-9-_ ]/g, '').trim().replace(/\s+/g, '-')
  return `${stem || 'case'}.iccase`
}

@Injectable()
export class ArchiveExportService {
  private readonly log = new Logger(ArchiveExportService.name)

  constructor(
    private readonly cases: CasesService,
    @Inject(EvidenceStore) private readonly store: EvidenceStore,
  ) {}

  async build(request: ExportRequest): Promise<ExportedArchive> {
    const data = (await this.cases.getWithCollections(request.caseId)) as unknown as Record<
      string,
      unknown
    >
    const members: Record<string, Uint8Array> = {}
    const omitted: string[] = []

    // **The Yjs documents come out of the case record and ride separately.**
    // Left in the JSON they would be a base64 blob in the file a human is
    // meant to read, and the JSON is the half that has to stay greppable.
    const reports = (data.reports ?? []) as { id: string; document?: Buffer | null }[]
    const carried = reports.map((report) => {
      const { document, ...rest } = report
      if (document && document.length > 0) {
        members[`${PROSE_PREFIX}${report.id}.ydoc`] = new Uint8Array(document)
      }
      return rest
    })

    const record = { ...data, reports: carried }
    members[CASE_NAME] = new TextEncoder().encode(JSON.stringify(record, null, 2))

    const attachments: Attachments = request.includeFiles ? 'included' : 'omitted'
    if (request.includeFiles) {
      // **By digest, so an artefact attached to two rows travels once.** The
      // store is content-addressed and the archive follows it; the rows name
      // the digest, so nothing is lost by not repeating the bytes.
      const evidence = (data.evidence ?? []) as { hash?: string | null; name?: string | null }[]
      const seen = new Set<string>()
      for (const row of evidence) {
        const hash = row.hash ?? ''
        if (!hash || seen.has(hash)) continue
        seen.add(hash)
        const bytes = await this.store.read(hash)
        if (!bytes) {
          // **Named rather than failing the export.** The row says this
          // install holds the file and it does not; an export that refuses
          // leaves the analyst with nothing, and one that says what is
          // missing leaves them with the case.
          omitted.push(row.name || hash)
          this.log.warn(`evidence ${hash} is recorded and not held; omitted from the archive`)
          continue
        }
        members[`${EVIDENCE_PREFIX}${hash}`] = bytes
      }
    }

    const zip = await pack(members, attachments)
    const bytes = request.passphrase ? await seal(zip, request.passphrase) : zip

    return {
      bytes,
      // `textOf`, because `data` is a `Record<string, unknown>` and
      // `String()` would name the archive '[object Object]' for anything
      // that is not a string. -> `domain/text-of.ts`
      filename: archiveName(
        textOf(data.reference),
        textOf(data.title),
        request.caseId,
      ),
      attachments,
      omitted,
    }
  }
}
