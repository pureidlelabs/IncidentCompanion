/**
 * `GET /api/report-block-kinds` - every section a report can hold, grouped.
 *
 * **The vocabulary, not a copy.** Eighteen kinds, six groups and the label of
 * each live in `models.REPORT_BLOCK_GROUPS` and the language packs; a
 * TypeScript copy is the one that goes stale the day a kind is added, with
 * nothing on screen to say so. The route exists for the reason `/api/plugins`
 * does.
 *
 * Two screens read it and neither may derive its own: the Add menu offers the
 * kinds, and the report index names each block chip. `blocks.kindLabel` is the
 * fallback for a kind the served menu does not carry - a prettified slug, and
 * marked as such, never a second source.
 *
 * `heading` is what the server would have stamped on the row. The React tier
 * creates a block through the generic `POST /api/cases/{id}/report_blocks`,
 * which runs no such rule, so this is posted back verbatim rather than
 * invented here.
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
