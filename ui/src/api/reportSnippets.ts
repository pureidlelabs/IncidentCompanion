/**
 * `GET /api/report-snippets` - the reusable paragraphs the `/` menu offers.
 *
 * **The recommendations an MSSP writes over and over**, plus the caveat
 * paragraphs every report owes: tier the admin accounts, keep an offline
 * backup, alert on a service account authenticating interactively. They are
 * library rows, so an install's own wording is an entry rather than a fork -
 * which is the whole reason none of this is a TypeScript array.
 *
 * Not `staleTime: Infinity`, unlike `useReportBlockKinds` beside it. That one
 * reads module constants; these are rows an analyst writes, and one added in
 * the library pane should reach the next `/` without a reload.
 *
 * **Keyed by language, and a row says which one answered.** A snippet carries
 * its translations in its own payload rather than in a language pack, because the
 * text is prose somebody wrote. An untranslated one falls back to English and
 * reports `language: "en"` - the menu marks that rather than passing English
 * prose off as a translation.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { request } from './client'
import { keys } from './queryKeys'

export interface ReportSnippet {
  name: string
  label: string
  /** The slot it is filed under - `identity`, `detection`, `caveats` and the
   *  rest of `SNIPPET_SLOTS`. Empty for a snippet filed under none. */
  group: string
  /** One clause beside the label. What the snippet is *for*, never its first words. */
  hint: string
  /** Markdown, inserted as typed. */
  body: string
  /** False for a snippet the analyst added themselves. */
  builtin: boolean
  /** Which language answered. Not always the one asked for. */
  language: string
  /** Every language the snippet carries, for a pane offering to fill in the rest. */
  languages: string[]
}

export interface SnippetLibrary {
  snippets: ReportSnippet[]
  /** Entries that would not load. Served empty rather than omitted, because
   *  the menu dereferences it. */
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
    // A minute, not forever: these are rows an analyst can write.
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
}

export function libraryOf(query: UseQueryResult<SnippetLibrary>): SnippetLibrary {
  return query.data ?? EMPTY
}
