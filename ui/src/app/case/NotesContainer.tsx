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
     * **Leaving skips the mutation and is still announced.**
     *
     * `mutateAsync` awaits `onMutate` before it reaches the request, and a
     * caller on the way out has no later tick to be resumed on -- so that door
     * issues the POST directly, with `keepalive`, which is also what lets it
     * survive a tab closed a moment after the navigation that started it.
     *
     * **Announced either way**, because `announcing` wraps any promise and the
     * toast region outlives the screen: telling an analyst their note was
     * refused and issuing a request that outlives the page are not
     * alternatives, and treating them as two doors lost the write.
     *
     * The optimistic row and the invalidation the mutation adds are what the
     * ordinary blur still wants, and are worth nothing to a screen that is
     * going.
     */
    create: (fields, leaving = false) =>
      leaving
        ? announcing('the note', () => createEntry(caseId, 'casenotes', fields, true))
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
