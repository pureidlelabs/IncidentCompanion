/**
 * `GET /api/report-block-kinds` - every section a report can hold, grouped.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { request } from './client'
import { keys } from './queryKeys'

export interface BlockKind {
  kind: string
  /** What the menu button says, in the language asked for. */
  label: string
}

export interface BlockKindGroup {
  heading: string
  kinds: BlockKind[]
}

export function useReportBlockKinds(language: string): UseQueryResult<BlockKindGroup[]> {
  return useQuery({
    queryKey: keys.reportBlockKinds(language),
    queryFn: async () => {
      const search = language ? `?lang=${encodeURIComponent(language)}` : ''
      const served = await request<{ groups: BlockKindGroup[] }>(
        `/report-block-kinds${search}`,
      )
      return served.groups
    },
    // Module constants and a language pack read at import -
    // neither can change while this server process lives.
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  })
}

/** `{kind: label}` over every group, for a screen naming one kind at a time. */
export function labelsByKind(groups: readonly BlockKindGroup[] | undefined): Readonly<
  Record<string, string>
> {
  const out: Record<string, string> = {}
  for (const group of groups ?? []) {
    for (const kind of group.kinds) out[kind.kind] = kind.label
  }
  return out
}
