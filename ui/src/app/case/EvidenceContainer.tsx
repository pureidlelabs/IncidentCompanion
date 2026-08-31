import { useCase } from '@/api/case'
import { useSpecs } from '@/api/specs'
import { useBulkPatch } from '@/api/useBulkPatch'
import { useEntryDelete } from '@/api/useEntryDelete'
import { useEntryMutation } from '@/api/useEntryMutation'
import { useEvidenceRecordCreate } from '@/api/useEvidenceRecordCreate'
import { useEvidenceUpload } from '@/api/useEvidenceUpload'
import { useCaseId } from '@/app/useCaseId'
import { reportBulkMissing } from '@/components/blocks/notify'
import { announcing } from './entryWrites'

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
 * The change feed invalidates `keys.case(caseId)`, so another analyst's write
 * re-fetches, the object identity changes, and the screen re-syncs its rows.
 * That is the repaint path, and it is the same one a re-read here uses.
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
   *
   * **Measured against the routes rather than assumed.** `POST` and
   * `PATCH :id` both answer with the stored row, so most writes need nothing
   * here. Two do not: the file route answers `{ hash, sizeBytes }` because it
   * patches the row a second time, and `PATCH bulk` answers with which ids
   * took the patch. For those the case is re-read and the row taken from it,
   * which is the server's copy either way -- never one merged here.
   */
  const reread = async (id: string): Promise<EvidenceEntry> => {
    const fresh = await kase.refetch()
    const row = fresh.data?.evidence.find((one) => one.id === id)
    if (!row) throw new Error(`Evidence ${id} is not in the case after writing it.`)
    return row
  }

  /**
   * A refused write, said out loud.
   *
   * **The screen deliberately does not catch** -- its `inFlight` says the
   * refusal "belongs to whoever supplied `writes`", and that is this file. Left
   * uncaught the rejection is silent: `save` closes the dialog before awaiting,
   * so a 409 shuts the form, leaves the row unchanged and tells the analyst
   * nothing. The section this replaces called `reportWriteFailure` at five
   * sites; converting the screen without it is a regression rather than a
   * simplification.
   *
   * It re-throws, because the screen's list must not take a row the case did
   * not: the awaited call is what decides whether `setRows` runs.
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
      const written = await announcing('the selected records', () =>
        bulk.mutateAsync({ ids: [...ids], fields }),
      )
      // **Named rather than dropped.** A row somebody else deleted comes back
      // under `missing`, and silence about it is the same defect as a silent
      // refusal one line up -- the analyst pressed apply on a selection and
      // part of it did not happen.
      reportBulkMissing(written.missing, 'records')
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
