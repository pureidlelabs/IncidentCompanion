import { useCase } from '@/api/case'
import { useSpecs } from '@/api/specs'
import { useBulkPatch } from '@/api/useBulkPatch'
import { useBulkDelete } from '@/api/useBulkDelete'
import { useEntryMutation } from '@/api/useEntryMutation'
import { useEvidenceRecordCreate } from '@/api/useEvidenceRecordCreate'
import { useEvidenceUpload } from '@/api/useEvidenceUpload'
import { useCaseId } from '@/app/useCaseId'
import { announcing, entryWrites } from './entryWrites'

import { EvidenceScreen, type EvidenceWrites } from '@/screens/evidence'

import type { EvidenceEntry } from '@/api/model'

/**
 * `EvidenceScreen` bound to the case it draws and the writes it makes.
 *
 * **One case fetch, not five collection fetches.** The screen reads
 * `kase.evidence` and the reference options the dialog needs, and `useCase`
 * answers with the whole record -- so they arrive together rather than as four
 * queries a container would have to keep aligned.
 *
 * **The shared writes, with a save of its own.** A record and its bytes are
 * two calls, which is the one way evidence differs from every other register;
 * a patch across a selection and a delete are the same as everywhere else.
 */
export function EvidenceContainer() {
  const caseId = useCaseId()
  const kase = useCase(caseId)
  const specs = useSpecs()

  const create = useEvidenceRecordCreate(caseId)
  const upload = useEvidenceUpload(caseId)

  const shared = entryWrites<'evidence'>(
    {
      create,
      patch: useEntryMutation(caseId, 'evidence'),
      bulk: useBulkPatch(caseId, 'evidence'),
      bulkDelete: useBulkDelete(caseId),
    },
    { one: 'the evidence record', many: 'the selected records' },
    async () => (await kase.refetch()).data?.evidence ?? [],
    (row) => row.name,
    'evidence',
  )

  /**
   * The row the server holds, after an upload that did not answer with one.
   *
   * The file route answers `{ hash, sizeBytes }` because it patches the row a
   * second time, so the case is re-read and the row taken from it, which is
   * the server's copy -- never one merged here.
   */
  const reread = async (id: string): Promise<EvidenceEntry> => {
    const fresh = await kase.refetch()
    const row = fresh.data?.evidence.find((one) => one.id === id)
    if (!row) throw new Error(`Evidence ${id} is not in the case after writing it.`)
    return row
  }

  const writes: EvidenceWrites = {
    save: async (entry, fields, file) => {
      if (entry !== null) return shared.save(entry, fields)
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
    },
    patch: shared.patch,
    remove: shared.remove,
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
