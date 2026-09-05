/**
 * `GET /api/about` - what this build is, what it sends anywhere else, and
 * under what licence. The one route the About pane owns.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import type { About } from '@contract/about'

import { request } from './client'
import { keys } from './queryKeys'

export type AboutInfo = About

export function useAbout(): UseQueryResult<AboutInfo> {
  return useQuery({
    queryKey: keys.about(),
    queryFn: () => request<AboutInfo>('/about'),
  })
}
