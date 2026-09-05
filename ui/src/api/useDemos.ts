/**
 * `GET /api/demos` - the picker's Demo cases pane.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { request } from './client'
import { keys } from './queryKeys'

export interface DemoCase {
  /** The seeded case, to link into. */
  id: string
  /** Python's reserved `case_id`, kept as the human reference. */
  reference: string
  customer: string
  title: string
  /** The incident class. Never restates `scale`. */
  scenario: string
  scale: string
  /** A key into the picker's own icon table - `demoGlyph`. Never a class name
   *  or a URL: the server has no idea what this client draws with. */
  glyph: string
  summary: string
}

export function useDemos(): UseQueryResult<DemoCase[]> {
  return useQuery({
    queryKey: keys.demos(),
    queryFn: () => request<DemoCase[]>('/demos'),
  })
}
