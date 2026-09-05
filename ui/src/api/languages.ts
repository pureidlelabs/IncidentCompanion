/**
 * `/api/report/languages` - the packs a report may be written in.
 *
 * **A pack is JSON, not a file upload.** The route takes a parsed body, so the
 * pane reads the chosen `.json` and posts its contents; there is no multipart
 * here and no server-side parse of an arbitrary blob.
 *
 * **`coverage` and `builtin` arrive resolved.** Coverage is measured against
 * English's own key set, which only the server holds - deriving it here would
 * need the key list on the wire and would disagree the moment a string is
 * added. `builtin` is why a row has no remove control: a shipped pack comes
 * back on the next start, so removing it is a button that undoes itself.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'

import type { ApiError } from './client'
import { request } from './client'
import { keys } from './queryKeys'

export interface LanguagePack {
  code: string
  label: string
  /** 0 to 1, against the English key set. */
  coverage: number
  /** Shipped with the app, so it cannot be removed. */
  builtin: boolean
}

export interface LanguagesView {
  languages: LanguagePack[]
  /** How many strings a complete pack carries. */
  keyCount: number
}

/** What an upload carries: the pack's own identity plus its strings. */
export interface PackUpload {
  code: string
  label: string
  strings: Record<string, string>
}

export interface Uploaded {
  language: LanguagePack
  /** Keys this app has no place for. Stored for nothing, so they are named. */
  ignored: string[]
}

const PATH = '/report/languages'

export function useLanguages(): UseQueryResult<LanguagesView> {
  return useQuery({
    queryKey: keys.reportLanguages(),
    queryFn: () => request<LanguagesView>(PATH),
  })
}

/**
 * **Invalidates rather than writing the answer in.** The response names what
 * was ignored, which the pane reports; the *list* it belongs in also carries
 * coverage the server recomputed, so patching one row in would leave the rest
 * of the table describing the upload before it happened.
 */
export function useLanguageUpload(): UseMutationResult<Uploaded, ApiError, PackUpload> {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (pack: PackUpload) =>
      request<Uploaded>(PATH, { method: 'PUT', body: pack as unknown as Record<string, unknown> }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.reportLanguages() })
    },
  })
}

export function useLanguageRemove(): UseMutationResult<{ removed: string }, ApiError, string> {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (code: string) =>
      request<{ removed: string }>(`${PATH}/${encodeURIComponent(code)}`, { method: 'DELETE' }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.reportLanguages() })
    },
  })
}
