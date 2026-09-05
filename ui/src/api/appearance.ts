/**
 * Each analyst's chosen disc colour and initials.
 */
import { useMutation, useQuery, useQueryClient, type UseQueryResult }
  from '@tanstack/react-query'

import { request, requestBody } from './client'
import { keys } from './queryKeys'

export interface Appearance {
  /** `request`'s body takes a plain record; the two named fields are all of it. */
  [key: string]: unknown
  /** Index into the presence palette. Absent means derive it. */
  tone?: number
  /** At most two characters, already upper-cased by the server. */
  initials?: string
  /**
   * Bumped on every image write, absent when there is none.
   */
  avatarVersion?: number
}

/**
 * Where an analyst's image is served from, or undefined when there is none.
 */
export function avatarUrl(
  userId: string, version: number | undefined,
): string | undefined {
  if (version === undefined) return undefined
  return `/api/appearance/${encodeURIComponent(userId)}/avatar?v=${String(version)}`
}

export interface AppearanceRecord extends Appearance {
  userId: string
}

/**
 * What a PATCH may carry, which is not what a read returns.
 */
export interface AppearancePatch {
  /** `request`'s body takes a plain record, exactly as `Appearance` does. */
  [key: string]: unknown
  tone?: number | null
  initials?: string
}

/**
 * `user id -> what they chose`. Absent means they have chosen nothing.
 */
export type Appearances = Map<string, Appearance>

export function useAppearances(): UseQueryResult<Appearances> {
  return useQuery({
    queryKey: keys.appearance(),
    queryFn: async () => {
      // **`/appearance/roster`, not `/appearance`.** The latter is this
      // analyst's own settings - theme and clock included, which are nobody
      // else's business. Reading it here is what left `rows` undefined and
      // took every chosen disc in the app down with one `TypeError`.
      const answer = await request<{ rows: AppearanceRecord[] }>('/appearance/roster')
      return new Map(answer.rows.map((row) => [row.userId, row]))
    },
    // Rarely changes and is read by every disc on the screen; a write
    // invalidates it, which is the only thing that should.
    staleTime: 5 * 60_000,
  })
}

export function useUploadAvatar() {
  const queries = useQueryClient()
  return useMutation({
    // The bytes go up as the whole body: the route reads the raw stream and
    // refuses any `content-type` outside its allowed images, so a multipart
    // envelope is refused before sharp ever sees a byte.
    mutationFn: (file: File) =>
      requestBody<{ avatarVersion: number }>('/appearance/avatar', file, { method: 'PUT' }),
    onSuccess: () => {
      void queries.invalidateQueries({ queryKey: keys.appearance() })
    },
  })
}

export function useClearAvatar() {
  const queries = useQueryClient()
  return useMutation({
    mutationFn: () =>
      request<{ avatarVersion: number }>('/appearance/avatar', { method: 'DELETE' }),
    onSuccess: () => {
      void queries.invalidateQueries({ queryKey: keys.appearance() })
    },
  })
}

export function useSetAppearance() {
  const queries = useQueryClient()
  return useMutation({
    mutationFn: (chosen: AppearancePatch) =>
      request<Appearance>('/appearance', { method: 'PATCH', body: chosen }),
    onSuccess: () => {
      void queries.invalidateQueries({ queryKey: keys.appearance() })
    },
  })
}
