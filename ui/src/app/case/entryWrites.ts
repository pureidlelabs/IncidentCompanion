import {
  reportBulkMissing,
  reportBulkRefused,
  reportWriteFailure,
  type WriteFailureOptions,
} from '@/components/blocks/notify'

import { ApiError } from '@/api/client'
import type { CollectionEntry, CollectionName, GenericCreateCollectionName } from '@/api/model'
import type { Drawn, Read } from '@/api/rowWrite'
import type { BulkDeleteVars, BulkDeleted } from '@/api/useBulkDelete'
import type { BulkPatchRow } from '@/api/useBulkPatch'

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
 * All or nothing: each row travels with the version it was read at when the
 * analyst pressed Delete, so a row another analyst has edited since refuses
 * the whole selection. -> #682
 */
export async function removeSelection(
  bulkDelete: { mutateAsync: (vars: BulkDeleteVars) => Promise<BulkDeleted> },
  collection: CollectionName,
  rows: readonly BulkPatchRow[],
  many: string,
): Promise<void> {
  if (rows.length === 0) return
  const written = await announcing(
    many,
    () => bulkDelete.mutateAsync({ targets: { [collection]: [...rows] } }),
    // The confirmation says which rows moved, so the refusal is its to draw.
    { refused: () => undefined },
  )
  // A row another analyst had already deleted comes back under `missing`,
  // and is told rather than discarded.
  reportBulkMissing(
    written.missing.map((row) => row.id),
    many,
  )
}

/** What a container hands this helper: the mutations, already bound. */
export interface EntryMutations<N extends CollectionName> {
  create: {
    mutateAsync: (vars: { fields: Partial<CollectionEntry[N]> }) => Promise<CollectionEntry[N]>
  }
  patch: {
    mutateAsync: (vars: {
      entryId: string
      version: Read
      fields: Partial<CollectionEntry[N]>
      base?: Partial<CollectionEntry[N]> | undefined
    }) => Promise<CollectionEntry[N]>
  }
  bulk: {
    mutateAsync: (vars: { ids: BulkPatchRow[]; fields: Partial<CollectionEntry[N]> }) => Promise<{
      updated: string[]
      missing: string[]
      refused: string[]
    }>
  }
  bulkDelete: { mutateAsync: (vars: BulkDeleteVars) => Promise<BulkDeleted> }
}

/**
 * @param noun - what a refusal calls the thing, in the analyst's words.
 * @param reread - the case, re-fetched, because `PATCH bulk` answers with ids.
 * @param nameOf - what the analyst calls one row, for saying which rows moved.
 * @param collection - the table a delete names, which the bulk route groups by.
 */
export function entryWrites<N extends GenericCreateCollectionName>(
  mutations: EntryMutations<N>,
  noun: { one: string; many: string },
  reread: () => Promise<readonly CollectionEntry[N][]>,
  nameOf: (row: CollectionEntry[N]) => string,
  collection: CollectionName,
) {
  return {
    save: (entry: Drawn<CollectionEntry[N]> | null, fields: Partial<CollectionEntry[N]>) =>
      announcing(noun.one, () =>
        entry === null
          ? mutations.create.mutateAsync({ fields })
          : mutations.patch.mutateAsync({
              entryId: (entry as { id: string }).id,
              version: entry.version,
              fields,
              base: entry as unknown as Partial<CollectionEntry[N]>,
            }),
      ),

    /** One patch across a selection, as it was read when Edit was pressed. */
    patch: async (rows: readonly BulkPatchRow[], fields: Partial<CollectionEntry[N]>) => {
      const written = await announcing(noun.many, () =>
        mutations.bulk.mutateAsync({ ids: [...rows], fields }),
      )
      const held = await reread()
      const named = (id: string) => held.find((row) => (row as { id: string }).id === id)
      reportBulkMissing(written.missing, noun.many)
      reportBulkRefused(
        written.refused.map((id) => {
          const row = named(id)
          return row ? nameOf(row) : id
        }),
      )
      // `updated`, not the rows sent: a row somebody else deleted comes back
      // under `missing`, and returning it would show a row the case has not.
      return written.updated.flatMap((id) => {
        const row = named(id)
        return row ? [row] : []
      })
    },

    remove: (rows: readonly BulkPatchRow[]) =>
      removeSelection(mutations.bulkDelete, collection, rows, noun.many),
  }
}
