/**
 * `GET /api/report-snippets` - the reusable paragraphs the `/` menu offers.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { request } from './client'
import { keys } from './queryKeys'

export interface ReportSnippet {
  name: string
  /** What the menu row says. */
  label: string
  /** The menu heading it is filed under - Identity, Detection, Caveats... */
  group: string
  /** One clause beside the label. What the snippet is *for*, never its first words. */
  hint: string
  /** Markdown, inserted as typed. */
  body: string
  /** False for a file the analyst dropped in themselves. */
  builtin: boolean
  /** Which language answered. Not always the one asked for. */
  language: string
  /** Every language the file carries, for a pane offering to fill in the rest. */
  languages: string[]
}

export interface SnippetLibrary {
  snippets: ReportSnippet[]
  /** Drop-ins that would not load, said rather than logged. */
  problems: string[]
}

const EMPTY: SnippetLibrary = { snippets: [], problems: [] }

export function useReportSnippets(language: string): UseQueryResult<SnippetLibrary> {
  return useQuery({
    queryKey: keys.reportSnippets(language),
    queryFn: async () => {
      // Normalised here rather than trusted. The `/` menu is opened
      // mid-sentence, and a body missing `snippets` would throw inside the
      // editor's own render - the analyst's section disappears, and nothing
      // on screen connects that to a library they never asked for.
      const search = language ? `?lang=${encodeURIComponent(language)}` : ''
      const served = await request<Partial<SnippetLibrary> | null>(
        `/report-snippets${search}`)
      return {
        snippets: served?.snippets ?? [],
        problems: served?.problems ?? [],
      }
    },
    // A minute, not forever: the directory is the analyst's to write into.
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
}

/** The library, or an empty one - a menu never renders `undefined`. */
export function libraryOf(query: UseQueryResult<SnippetLibrary>): SnippetLibrary {
  return query.data ?? EMPTY
}
