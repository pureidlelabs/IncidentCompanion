import { useCase } from '@/api/case'
import { useSpecs } from '@/api/specs'
import { useBulkPatch } from '@/api/useBulkPatch'
import { useEntryDelete } from '@/api/useEntryDelete'
import { useEntryMutation } from '@/api/useEntryMutation'
import { useEvidenceRecordCreate } from '@/api/useEvidenceRecordCreate'
import { useEvidenceUpload } from '@/api/useEvidenceUpload'
import { useCaseId } from '@/app/useCaseId'
import { reportBulkMissing, reportBulkRefused } from '@/components/blocks/notify'
import { announcing } from './entryWrites'

import { EvidenceScreen, type EvidenceWrites } from '@/screens/evidence'

import type { EvidenceEntry } from '@/api/model'

/**
 * `EvidenceScreen` bound to the case it draws and the writes it makes.
 */
export function EvidenceContainer() {
  const caseId = useCaseId()
  const kase = useCase(caseId)
  const specs = useSpecs()

  const create = useEvidenceRecordCreate(caseId)
  const patch = useEntryMutation(caseId, 'evidence')
  const bulk = useBulkPatch(caseId, 'evidence')
  const remove = useEntryDelete(caseId, 'evidence')
  const upload = useEvidenceUpload(caseId)

  /**
   * The row the server holds, after a write that did not answer with one.
   */
  const reread = async (id: string): Promise<EvidenceEntry> => {
    const fresh = await kase.refetch()
    const row = fresh.data?.evidence.find((one) => one.id === id)
    if (!row) throw new Error(`Evidence ${id} is not in the case after writing it.`)
    return row
  }

  /**
   * A refused write, said out loud.
   */
  const writes: EvidenceWrites = {
    save: async (entry, fields, file) => {
      if (entry === null) {
        // A record and its bytes are two calls and `useEvidenceUpload` owns the
        // order. Its answer is the digest rather than the row, so the row is
        // read back -- `storedAt`, `hash` and `sizeBytes` are all set by the
        // second call and the create's answer predates them.
        if (file) {
          const made = await announcing('the evidence record', () =>
            upload.mutateAsync({ file, fields }),
          )
          return reread(made.id)
        }
        return announcing('the evidence record', () => create.mutateAsync({ fields }))
      }
      // **The version and the base ride beside the fields.** The base is the
      // row the analyst was looking at, which is what lets a refusal say "we
      // both edited this field" rather than "the row moved".
      return announcing('the evidence record', () =>
        patch.mutateAsync({
          entryId: entry.id,
          version: entry.version,
          fields,
          base: entry,
        }),
      )
    },

    patch: async (ids, fields) => {
      // **The version travels per row, read off the records on screen**, so a
      // moved one is turned away on its own.
      const now = kase.data?.evidence ?? []
      const named: { id: string; version: number }[] = []
      // A selected record the case no longer holds is counted missing here:
      // the server cannot be asked about a row without a version, and dropping
      // it silently would take it out of the count below.
      const gone: string[] = []
      for (const id of ids) {
        const row = now.find((one) => one.id === id)
        if (row) named.push({ id, version: row.version })
        else gone.push(id)
      }

      const written = await announcing('the selected records', () =>
        bulk.mutateAsync({ ids: named, fields }),
      )
      // **Named rather than dropped.** A record somebody else deleted comes
      // back under `missing` and one they changed under `refused`; silence
      // about either is the same defect as a silent refusal one line up -- the
      // analyst pressed apply on a selection and part of it did not happen.
      reportBulkMissing([...gone, ...written.missing], 'records')
      reportBulkRefused(written.refused, 'records')
      // `updated`, not the ids sent: returning a missing one would put a row
      // on screen the case no longer holds.
      const fresh = await kase.refetch()
      const held = fresh.data?.evidence ?? []
      return written.updated.flatMap((id) => held.filter((row) => row.id === id))
    },

    remove: async (ids) => {
      // One at a time, because the version check is per row: a delete that
      // named no version would take a row somebody had just changed.
      for (const id of ids) {
        const row = kase.data?.evidence.find((one) => one.id === id)
        await announcing('the evidence record', () =>
          remove.mutateAsync({ entryId: id, version: row?.version ?? 0 }),
        )
      }
    },
  }

  return (
    <EvidenceScreen
      kase={kase.data}
      specs={specs.data}
      busy={kase.isPending || specs.isPending}
      {...(kase.error === null ? {} : { problem: kase.error })}
      onRetry={() => {
        void kase.refetch()
      }}
      writes={writes}
    />
  )
}
