import {
  reportBulkMissing,
  reportBulkRefused,
  reportWriteFailure,
  type WriteFailureOptions,
} from '@/components/blocks/notify'

import { ApiError } from '@/api/client'
import type { CollectionEntry, CollectionName, GenericCreateCollectionName } from '@/api/model'
import type { BulkDeleteVars, BulkDeleted } from '@/api/useBulkDelete'

/**
 * The write path every collection container shares.
 *
 * Each screen declares its own `*Writes` interface, and the three members mean
 * the same thing in all of them: a save resolves with the row the server
 * stored, a patch with the rows it took, a remove with nothing. What differs is
 * the row type and, for evidence, a file -- so the shape is assembled here and
 * the odd one out supplies its own `save`.
 *
 * **A refused write is announced here.** The screens deliberately do not catch:
 * `inFlight` says the refusal belongs to whoever supplied `writes`, and a
 * container that lets it reject silently closes the dialog and tells the
 * analyst nothing.
 */

export interface AnnounceOptions extends WriteFailureOptions {
  /** Take a refused write rather than toasting it, for a screen that draws the merge review. */
  refused?: (error: ApiError) => void
}

/** Says a refusal out loud, then re-throws so the screen does not keep the row. */
export async function announcing<T>(
  what: string,
  run: () => Promise<T>,
  options?: AnnounceOptions,
): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (options?.refused && error instanceof ApiError && error.writeConflict) {
      options.refused(error)
      throw error
    }
    // The retry is announced the same way, or its own failure has nowhere to go.
    reportWriteFailure(error, what, {
      ...options,
      retry: () => void announced(what, run, options),
    })
    throw error
  }
}

/**
 * `announcing` for a caller with nothing to do after a failure.
 *
 * Resolves to nothing rather than rethrowing: the failure has been announced,
 * and a caller that voids the promise would otherwise leave the rethrow to
 * surface as an uncaught rejection beside the toast that already reported it.
 */
export async function announced<T>(
  what: string,
  run: () => Promise<T>,
  options?: AnnounceOptions,
): Promise<T | undefined> {
  try {
    return await announcing(what, run, options)
  } catch {
    return undefined
  }
}

/**
 * Delete a selection of one collection's rows, as one act.
 *
 * All or nothing: each row travels with the version it was read at, so a row
 * another analyst has edited refuses the whole selection. -> #682
 */
export async function removeSelection(
  bulkDelete: { mutateAsync: (vars: BulkDeleteVars) => Promise<BulkDeleted> },
  collection: CollectionName,
  ids: readonly string[],
  rowsNow: () => readonly { id: string; version: number }[],
  many: string,
): Promise<void> {
  if (ids.length === 0) return
  const now = rowsNow()
  const rows = ids.map((id) => ({
    id,
    version: now.find((one) => one.id === id)?.version ?? 0,
  }))
  const written = await announcing(many, () =>
    bulkDelete.mutateAsync({ targets: { [collection]: rows } }),
  )
  // A row another analyst had already deleted comes back under `missing`,
  // and is told rather than discarded.
  reportBulkMissing(
    written.missing.map((row) => row.id),
    many,
  )
}

/** What a container hands this helper: the four mutations, already bound. */
export interface EntryMutations<N extends CollectionName> {
  create: {
    mutateAsync: (vars: { fields: Partial<CollectionEntry[N]> }) => Promise<CollectionEntry[N]>
  }
  patch: {
    mutateAsync: (vars: {
      entryId: string
      version: number
      fields: Partial<CollectionEntry[N]>
      base?: Partial<CollectionEntry[N]> | undefined
    }) => Promise<CollectionEntry[N]>
  }
  bulk: {
    mutateAsync: (vars: {
      ids: { id: string; version: number }[]
      fields: Partial<CollectionEntry[N]>
    }) => Promise<{
      updated: string[]
      missing: string[]
      refused: string[]
    }>
  }
  remove: { mutateAsync: (vars: { entryId: string; version: number }) => Promise<unknown> }
  bulkDelete: { mutateAsync: (vars: BulkDeleteVars) => Promise<BulkDeleted> }
}

/**
 * @param noun - what a refusal calls the thing, in the analyst's words.
 * @param rowsNow - the rows as the case currently holds them, for the version a
 * delete and a bulk patch each have to name, and for reading a bulk patch's
 * answer back.
 * @param reread - the case, re-fetched, because `PATCH bulk` answers with ids.
 * @param collection - the table a delete names, which the bulk route groups by.
 */
export function entryWrites<N extends GenericCreateCollectionName>(
  mutations: EntryMutations<N>,
  noun: { one: string; many: string },
  rowsNow: () => readonly CollectionEntry[N][],
  reread: () => Promise<readonly CollectionEntry[N][]>,
  collection: CollectionName,
) {
  return {
    save: (entry: CollectionEntry[N] | null, fields: Partial<CollectionEntry[N]>) =>
      announcing(noun.one, () =>
        entry === null
          ? mutations.create.mutateAsync({ fields })
          : mutations.patch.mutateAsync({
              entryId: (entry as { id: string }).id,
              version: (entry as { version: number }).version,
              fields,
              base: entry,
            }),
      ),

    patch: async (ids: readonly string[], fields: Partial<CollectionEntry[N]>) => {
      // **The version travels per row, read off the rows on screen.** A
      // selection is a slice of what the analyst read, so a moved row is
      // turned away on its own.
      const now = rowsNow()
      const named: { id: string; version: number }[] = []
      // **A selected row the case no longer holds is counted missing here.**
      // The server cannot be asked about a row without a version, and dropping
      // it silently would take it out of the count the analyst is told.
      const gone: string[] = []
      for (const id of ids) {
        const row = now.find((one) => (one as { id: string }).id === id)
        if (row) named.push({ id, version: (row as { version: number }).version })
        else gone.push(id)
      }

      const written = await announcing(noun.many, () =>
        mutations.bulk.mutateAsync({ ids: named, fields }),
      )
      reportBulkMissing([...gone, ...written.missing], noun.many)
      reportBulkRefused(written.refused, noun.many)
      const held = await reread()
      // `updated`, not the ids sent: a row somebody else deleted comes back
      // under `missing`, and returning it would show a row the case has not.
      return written.updated.flatMap((id) =>
        held.filter((row) => (row as { id: string }).id === id),
      )
    },

    remove: (ids: readonly string[]) =>
      removeSelection(mutations.bulkDelete, collection, ids, rowsNow, noun.many),
  }
}
