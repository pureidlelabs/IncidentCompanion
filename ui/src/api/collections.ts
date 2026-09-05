/**
 * `GET /api/collections` - which tables exist and which of them the *batch*
 * doors will write to.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { request } from './client'
import type { CollectionName } from './model'
import { keys } from './queryKeys'

export interface CollectionMeta {
  fields: readonly string[]
  batchCreate: boolean
}

type Wire = Record<string, { fields: string[]; batch_create: boolean }>

/** Static server-side metadata for the life of the process. See `specs.ts`. */
export function useCollections(): UseQueryResult<Partial<Record<CollectionName, CollectionMeta>>> {
  return useQuery({
    queryKey: keys.collections(),
    queryFn: async () => {
      const raw = await request<Wire>('/collections', { raw: true })
      const out: Partial<Record<CollectionName, CollectionMeta>> = {}
      for (const [name, meta] of Object.entries(raw)) {
        out[name as CollectionName] = { fields: meta.fields, batchCreate: meta.batch_create }
      }
      return out
    },
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  })
}
