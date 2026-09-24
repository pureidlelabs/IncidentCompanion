/**
 * A case, out, as a `.iccase`.
 *
 * Three kinds of member: `case.json` is the record, `prose/<report>.ydoc` and
 * `prose/casenotes/<note>.ydoc` the Yjs documents behind each report's written
 * blocks and each note, and `evidence/<digest>` the artefact bytes.
 *
 * **Whether the files travel is the analyst's choice per export, and the
 * manifest records it** - an import cannot tell a backup from a handover
 * without being told.
 */
import { Inject, Injectable, Logger, UnprocessableEntityException } from '@nestjs/common'

import { textOf } from '../domain/text-of.js'
import { CasesService } from '../cases/cases.service.js'
import { EvidenceStore } from '../evidence/store.js'
import { figureHashes } from '../report/document/model.js'
import {
  CASE_NAME,
  EVIDENCE_PREFIX,
  NOTE_PROSE_PREFIX,
  PROSE_PREFIX,
  pack,
  type Attachments,
} from '../archive/format.js'
import { WeakPassphrase, seal } from '../archive/envelope.js'
import { rowsIn } from './import.service.js'
import { PolicyService } from '../policy/policy.service.js'
import { NOTE_FRAGMENT, ProseService, reportDocument, type ProseRecord } from '../prose/prose.service.js'
import { rekeyed } from '../domain/prose-fields.js'
import { WRITTEN_BLOCK } from '../report/block-kinds.js'

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
    private readonly policy: PolicyService,
    private readonly prose: ProseService,
  ) {}

  /** The named fragments of a live document, as they read, or null when none holds anything. */
  private async asItReads(caseId: string, address: ProseRecord, fragments: readonly string[]): Promise<Uint8Array | null> {
    if (fragments.length === 0) return null
    const doc = await this.prose.open(caseId, address)
    try {
      return rekeyed(doc, new Map(fragments.map((name) => [name, name])))
    } finally {
      await this.prose.release(caseId, address)
    }
  }

  async build(request: ExportRequest): Promise<ExportedArchive> {
    /**
     * **Refused before the archive is built, not after `seal` throws.** A case
     * exported with its files packs the whole zip; discarding it because the
     * passphrase was short is work nobody asked for, once per attempt.
     *
     * **Read now, like every other bound**: a minimum cached at boot is one an
     * administrator cannot raise without a restart. -> `policy/read.ts`
     */
    const policy = await this.policy.read()
    const minimumChars = policy['evidence.passphraseChars']
    if (request.passphrase && request.passphrase.length < minimumChars) {
      throw new WeakPassphrase(`A passphrase is at least ${String(minimumChars)} characters.`)
    }

    const data = (await this.cases.getWithCollections(request.caseId)) as unknown as Record<
      string,
      unknown
    >
    const ceiling = policy['evidence.archiveRows']
    const rows = rowsIn(data)
    if (rows > ceiling) {
      throw new UnprocessableEntityException({
        message: `This case holds ${rows.toLocaleString('en-GB')} rows, and an archive carries at most ${ceiling.toLocaleString('en-GB')}.`,
      })
    }
    const members: Record<string, Uint8Array> = {}
    const omitted: string[] = []

    // **The Yjs documents ride beside the record, as each one reads.** Left in
    // the JSON they would be a base64 blob in the file a human is meant to
    // read; copied from the stored column they would carry every deletion.
    const reports = (data.reports ?? []) as {
      id: string
      document?: unknown
      frozen?: unknown
    }[]
    const blocks = (data.reportBlocks ?? []) as { id: string; reportId: string; kind: string }[]
    const carried: Record<string, unknown>[] = []
    for (const { document: _stored, ...report } of reports) {
      const written = blocks.filter((block) => block.reportId === report.id && block.kind === WRITTEN_BLOCK)
      const read = await this.asItReads(request.caseId, reportDocument(report.id), written.map((block) => block.id))
      if (read) members[`${PROSE_PREFIX}${report.id}.ydoc`] = read
      carried.push(report)
    }
    const notes = (data.casenotes ?? []) as { id: string; document?: unknown }[]
    const carriedNotes: Record<string, unknown>[] = []
    for (const { document: _stored, ...note } of notes) {
      const read = await this.asItReads(request.caseId, { table: 'casenotes', id: note.id }, [NOTE_FRAGMENT])
      if (read) members[`${NOTE_PROSE_PREFIX}${note.id}.ydoc`] = read
      carriedNotes.push(note)
    }

    const record = { ...data, reports: carried, casenotes: carriedNotes }
    members[CASE_NAME] = new TextEncoder().encode(JSON.stringify(record, null, 2))

    const attachments: Attachments = request.includeFiles ? 'included' : 'omitted'
    if (request.includeFiles) {
      // **By digest, so an artefact attached to two rows travels once.** The
      // rows name the digest, so nothing is lost by not repeating the bytes.
      // A row that does not say the bytes are held here is not asked about.
      const evidence = (data.evidence ?? []) as {
        hash?: string | null
        name?: string | null
        storedAt?: unknown
      }[]
      const seen = new Set<string>()
      for (const row of evidence) {
        const hash = row.hash ?? ''
        if (!row.storedAt || !hash || seen.has(hash)) continue
        seen.add(hash)
        const bytes = await this.store.read(request.caseId, hash)
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
      // A sent report's figures travel after their rows go; one never held here is not lost.
      for (const hash of reports.flatMap((report) => figureHashes(report.frozen))) {
        if (seen.has(hash)) continue
        seen.add(hash)
        const bytes = await this.store.read(request.caseId, hash)
        if (bytes) members[`${EVIDENCE_PREFIX}${hash}`] = bytes
      }
    }

    // **The names go into the archive, not only into the response.** The
    // header they were reported by lasts for one download; an analyst who
    // saved the file opens an archive that has to say this itself. -> #243
    const zip = await pack(members, attachments, omitted)
    const bytes = request.passphrase ? await seal(zip, request.passphrase, minimumChars) : zip

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
