import { useCase } from '@/api/case'
import { useSpecs } from '@/api/specs'
import { createEntry, useEntryCreate } from '@/api/useEntryCreate'
import { useEntryDelete } from '@/api/useEntryDelete'
import { useCaseId } from '@/app/useCaseId'
import { useSession } from '@/api/useSession'
import { NotesScreen, type NoteWrites } from '@/screens/notes'

import { announcing } from './entryWrites'


/**
 * `NotesScreen` bound to the case it draws and the two writes it makes.
 *
 * **Not `entryWrites`.** That helper's `save` takes an entry and patches it,
 * and a note is never patched: its body is a Yjs document and the server
 * derives `casenotes.note` from it. What is left is a create and a delete,
 * which is less than the shared shape rather than a variation on it.
 *
 * **The case id is what makes a note's body live.** The screen opens a Yjs
 * document per note over this case's socket; without an id it renders the
 * ordinary single-writer editor, which is the gallery's arrangement rather
 * than the app's. -> `screens/notes.tsx`
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
    /**
     * **Only a closing page skips the mutation.** `mutateAsync` awaits
     * `onMutate` before it reaches the request, and a caller inside a
     * `pagehide` handler has no later tick to be resumed on -- so that door
     * issues the POST directly, with `keepalive` to outlive the document.
     *
     * A link followed inside the app is not that: the page, the query client
     * and the toast region are all still mounted, so it takes the ordinary
     * write and an analyst is told when it is refused.
     */
    create: (fields, going = false) =>
      going
        ? createEntry(caseId, 'casenotes', fields, true)
        : announcing('the note', () => create.mutateAsync({ fields })),

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
