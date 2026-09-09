/**
 * `/api/library` -- the drop-in-file libraries: case templates, report layouts
 * and report snippets. A layout carries no `newLabel`, so its pane offers no
 * create control.
 *
 * Driven off `GET /api/library`'s own slug list rather than a name typed in
 * this file: a library the server adds reaches this tier with no client
 * change.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { request } from './client'
import { keys } from './queryKeys'

export interface LibrarySummary {
  slug: string
  noun: string
  newLabel: string | null
  allowBlank: boolean
}

export interface LibraryEntry {
  name: string
  label: string
  /** Shown under the template picker on the new-case form. */
  description: string
  /** "yours" / "built-in" -- the chip's text, mirroring `LibraryRow.origin`. */
  origin: 'yours' | 'built-in'
  canEdit: boolean
  canDelete: boolean
  canDuplicate: boolean
}

export interface StartOption {
  value: string
  label: string
}

export interface LibraryListing extends LibrarySummary {
  entries: readonly LibraryEntry[]
  startOptions: readonly StartOption[]
}

/** `(message, level)` -- the server's own pair shape, unpacked rather than
 *  renamed so a level ("positive" or "negative") reads the same here as it
 *  does in every refusal. */
export type WrittenMessage = readonly [string, string]

export interface Written {
  ok: boolean
  messages: readonly WrittenMessage[]
}

export function useLibrary(slug: string): UseQueryResult<LibraryListing> {
  return useQuery({
    queryKey: keys.library(slug),
    queryFn: () => request<LibraryListing>(`/library/${encodeURIComponent(slug)}`),
  })
}
