/**
 * `/api/report/languages` - the packs a report may be written in.
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
 * **Invalidates rather than writing the answer in.**
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
