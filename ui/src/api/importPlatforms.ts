/**
 * `GET /api/imports` - which detection platforms the operator pointed this
 * install at. An importer the install was not pointed at is not offered.
 */

import { useQuery } from '@tanstack/react-query'

import type { ImportPlatforms } from '@contract/incident-import'

import { request } from './client'
import { keys } from './queryKeys'

/** Whether the Sentinel importer is offered: `undefined` until the install has said. */
export function useSentinelOffered(): boolean | undefined {
  const { data, isError } = useQuery({
    queryKey: keys.importPlatforms(),
    queryFn: () => request<ImportPlatforms>('/imports'),
    staleTime: Infinity,
  })
  return isError ? false : data?.sentinel
}
