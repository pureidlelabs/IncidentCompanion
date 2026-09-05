import { useCase } from '@/api/case'
import { useSpecs } from '@/api/specs'
import { useEntryCreate } from '@/api/useEntryCreate'
import { useEntryDelete } from '@/api/useEntryDelete'
import { useCaseId } from '@/app/useCaseId'
import { useSession } from '@/api/useSession'
import { NotesScreen, type NoteWrites } from '@/screens/notes'

import { announcing } from './entryWrites'


/**
 * `NotesScreen` bound to the case it draws and the two writes it makes.
 */
export function NotesContainer() {
  const caseId = useCaseId()
  const kase = useCase(caseId)
  const specs = useSpecs()
  const session = useSession()

  // **Create makes the row the document is stored in**, once. A note the
  // server holds is never patched from here. -> `screens/notes.tsx`
  const create = useEntryCreate(caseId, 'casenotes')
  const remove = useEntryDelete(caseId, 'casenotes')

  const writes: NoteWrites = {
    create: (fields) => announcing('the note', () => create.mutateAsync({ fields })),

    // The version the screen read, so a note somebody else has since written
    // in is answered rather than taken. -> `db/mutate.ts`
    remove: async (entry) => {
      await announcing('the note', () =>
        remove.mutateAsync({ entryId: entry.id, version: entry.version }),
      )
    },
  }

  return (
    <NotesScreen
      caseId={caseId}
      kase={kase.data}
      specs={specs.data}
      {...(session?.username ? { analyst: session.username } : {})}
      busy={kase.isPending || specs.isPending}
      {...(kase.error === null ? {} : { problem: kase.error })}
      onRetry={() => {
        void kase.refetch()
      }}
      writes={writes}
    />
  )
}
