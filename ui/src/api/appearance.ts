/**
 * Each analyst's chosen disc colour and initials.
 *
 * **A chosen tone overrides the derived one; nothing else changes.** The hash
 * in `presenceTone` stays the default, so an install where nobody has chosen
 * looks exactly as it did - and one analyst choosing does not move anybody
 * else's colour.
 */
import { useMutation, useQuery, useQueryClient, type UseQueryResult }
  from '@tanstack/react-query'

import { request, requestBody } from './client'
import { keys } from './queryKeys'

export interface Appearance {
  /** `request`'s body takes a plain record; the named fields below are all of it. */
  [key: string]: unknown
  /** Index into the presence palette. Absent means derive it. */
  tone?: number
  /** At most two characters, already upper-cased by the server. */
  initials?: string
  /**
   * Bumped on every image write, absent when there is none.
   *
   * **The bytes are not in the roster.** It is read on every case, and an
   * image per analyst would be a few hundred kilobytes of base64 in a list
   * that mostly draws initials. This is what makes the `<img>` URL change
   * when somebody replaces theirs, so the response can be cached hard.
   */
  avatarVersion?: number
}

/**
 * Where an analyst's image is served from, or undefined when there is none.
 *
 * **Keyed by the analyst's id, not their name.** A display name is not unique,
 * so a name-keyed URL serves two analysts called Sam each other's face. The
 * presence roster carries `user_id` for exactly this.
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
 *
 * **`tone: null` asks for automatic; an absent key asks for no change.** The
 * patch is partial, so the two cannot be one value - and a read never carries
 * null, because the server omits the key instead.
 */
export interface AppearancePatch {
  /** `request`'s body takes a plain record, exactly as `Appearance` does. */
  [key: string]: unknown
  tone?: number | null
  initials?: string
}

/**
 * `user id -> what they chose`. Absent means they have chosen nothing.
 *
 * Keyed by id rather than by display name, for the reason `avatarUrl` gives.
 */
export type Appearances = Map<string, Appearance>

export function useAppearances(): UseQueryResult<Appearances> {
  return useQuery({
    queryKey: keys.appearance(),
    queryFn: async () => {
      // **`/appearance/roster`, not `/appearance`.** The latter is this
      // analyst's own settings - theme and clock included, which are nobody
      // else's business - and it carries no `rows`, so reading it here takes
      // every chosen disc in the app down with one `TypeError`.
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
