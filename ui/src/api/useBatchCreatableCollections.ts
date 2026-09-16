/**
 * `GET /api/collections`, reduced to the tables that take a batch write.
 *
 * **Fetched raw**, like `specs.ts`: the response is keyed by collection name
 * (`network_indicators`), and `fromWire`'s recursive camelisation would rewrite
 * that key into a table this client has never heard of.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { COLLECTION_NAMES, type CollectionName } from './model'
import { request } from './client'
import { keys } from './queryKeys'

type Wire = Record<string, { batch_create: boolean }>

/** Static server-side metadata for the life of the process. See `specs.ts`. */
export function useBatchCreatableCollections(): UseQueryResult<readonly CollectionName[]> {
  return useQuery({
    queryKey: keys.collections(),
    queryFn: async () => {
      const served = await request<Wire>('/collections', { raw: true })
      // Walked rather than filtered, so the row order is this client's and a
      // served name it has no label or case key for is dropped.
      return COLLECTION_NAMES.filter((name) => served[name]?.batch_create === true)
    },
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  })
}
