import { useNavigate } from 'react-router-dom'

import { useLibrary } from '@/api/library'
import { useSpecs } from '@/api/specs'
import { useCreateCase } from '@/api/useCreateCase'
import { ENTRY_SLUG } from '@/components/blocks/case-sections'
import { NewCaseScreen, type NewCaseWrites } from '@/screens/new-case'

/**
 * `NewCaseScreen` bound to the library, the served form and the create call.
 *
 * `door` is where the analyst lands once the case exists: a blank case opens
 * on its first section, and one started from the importer opens on the import
 * screen with the case already made. The fields are the same either way, which
 * is why one container serves both.
 */
export function NewCaseContainer({
  door,
  onClose,
}: {
  door: 'blank' | 'importer'
  onClose: () => void
}) {
  const navigate = useNavigate()
  const templates = useLibrary('templates')
  const specs = useSpecs()
  const create = useCreateCase()

  const writes: NewCaseWrites = {
    create: (fields) => create.mutateAsync(fields),
  }

  return (
    <NewCaseScreen
      templates={templates.data?.entries ?? []}
      specs={specs.data}
      isOpen
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      onCreated={(caseId) => {
        onClose()
        const at = `/cases/${encodeURIComponent(caseId)}`
        void navigate(door === 'importer' ? `${at}/import` : `${at}/${ENTRY_SLUG}`)
      }}
      busy={templates.isPending || specs.isPending}
      {...(templates.error ?? specs.error ? { problem: templates.error ?? specs.error } : {})}
      writes={writes}
    />
  )
}
