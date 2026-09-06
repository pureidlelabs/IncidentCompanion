import type { CollectionName } from './model'

/**
 * The query-key convention, in four lines. Every screen follows it.
 *
 * 1. A key is `['case', caseId, ...]` - the case id is always second, so
 *    `invalidateQueries({ queryKey: keys.case(id) })` reaches everything about
 *    one case and nothing about another.
 * 2. A collection is `keys.collection(caseId, name)`; one row is that key with
 *    the entry id appended. Narrowest-first prefixes mean a row invalidation
 *    never has to be spelled out twice.
 * 3. Keys are built here and nowhere else. A literal array at a call site is
 *    the one thing that makes an invalidation silently miss.
 * 4. **`collection` is `CollectionName`, not `string`.** Typed as `string` this
 *    file claimed a misspelled table was a compile error while accepting
 *    `'timelines'` silently - a query that fetches, caches and invalidates
 *    under a key nothing else ever writes to, so the symptom is a screen that
 *    simply never updates.
 */

export const keys = {
  cases: () => ['cases'] as const,
  demos: () => ['demos'] as const,
  case: (caseId: string) => ['case', caseId] as const,
  collection: (caseId: string, collection: CollectionName) =>
    ['case', caseId, 'collection', collection] as const,
  entry: (caseId: string, collection: CollectionName, entryId: string) =>
    ['case', caseId, 'collection', collection, entryId] as const,
  /** Prefixed by `case(caseId)`, on purpose: invalidating the case key already
   *  invalidates this one (TanStack matches by prefix), so a write hook's
   *  existing `keys.case(caseId)` invalidation reaches it with nothing added at
   *  the call site. That matters most here - every row write moves
   *  attribution, so the change feed's whole-case invalidation has to reach it
   *  without naming it. */
  attribution: (caseId: string) => ['case', caseId, 'attribution'] as const,
  /**
   * The case's activity feed, under the case key for the same reason
   * attribution is: any write anywhere on the case adds an entry to it, so the
   * whole-case invalidation has to reach it.
   */
  activity: (caseId: string) => ['case', caseId, 'activity'] as const,
  /** The rail's counts, attention number and reports list. Prefixed by
   *  `case(caseId)` like the two around it - but the change feed invalidates
   *  the case key `exact`, so this one is named there rather than reached.
   *  -> `useCaseChanges.invalidationsFor` */
  summary: (caseId: string) => ['case', caseId, 'summary'] as const,
  /** The compliance record and its verdict, which are not a collection.
   *  **Built here and not inline**, which is rule 3 above: spelled out at the
   *  call sites the change feed has no name to invalidate, and another
   *  analyst's compliance write leaves an open Compliance screen stale until
   *  it remounts. */
  compliance: (caseId: string) => ['case', caseId, 'compliance'] as const,
  /** A refused save's review. Prefixed by `case(caseId)` like the two above,
   *  so answering it - which invalidates the case - clears this too. */
  conflicts: (caseId: string) => ['case', caseId, 'conflicts'] as const,
  collections: () => ['collections'] as const,
  /** Not under a case: the specs document names none and reads none. */
  specs: () => ['specs'] as const,
  /** Also case-less, and deliberately a separate key from `specs`: the regime
   *  switches are install preferences that change while the server runs, so
   *  they must be invalidatable without dropping the specs document. */
  regimes: () => ['regimes'] as const,
  /** Case-less, and keyed by language: the labels are a language pack's, so
   *  one cache entry per language rather than a refetch that overwrites the
   *  menu the other report was composed in. */
  reportBlockKinds: (language: string) => ['report-block-kinds', language] as const,
  /** Keyed by language for `reportBlockKinds`' reason: the layout chips are
   *  named from a language pack. */
  reportLayouts: (language: string) => ['report-layouts', language] as const,
  /** **Not keyed by language**, unlike the three around it: this is the list of
   *  packs an install holds, which every language shares. */
  reportLanguages: () => ['report-languages'] as const,
  /** Keyed by language like the two above, though the translations live in
   *  each snippet's own file rather than in a language pack: one cache entry
   *  per language, so a Dutch report and an English one do not overwrite each
   *  other's menu. */
  reportSnippets: (language: string) => ['report-snippets', language] as const,
  plugins: () => ['plugins'] as const,
  recentCases: () => ['recent-cases'] as const,
  /** Case-less: an analyst's chosen disc colour and initials belong to the
   *  install, and every case's presence stack reads the same answer. */
  appearance: () => ['appearance'] as const,
  caseTemplates: () => ['case-templates'] as const,
  /** Case-less: build identity, constant for the life of the process. */
  about: () => ['about'] as const,
  /** The readiness probe, polled rather than invalidated - see `useBackendHealth`. */
  health: () => ['health'] as const,
  /** **Prefixed by `health()` on purpose**, so the Health pane's two reads
   *  refresh together with the probe they sit beside. */
  healthResources: () => ['health', 'resources'] as const,
  healthActivity: () => ['health', 'activity'] as const,
  /** One library's entries, load problems and New's start-from options.
   *  Keyed under a bare `library` prefix on purpose (TanStack matches by
   *  prefix), so a broad invalidation reaches every open library pane. */
  library: (slug: string) => ['library', slug] as const,
  /** One file's structured editor -- narrower than `library(slug)` so an edit
   *  dialog can be invalidated without dropping the row list it was opened
   *  from. */
  libraryEditor: (slug: string, name: string) =>
    ['library', slug, name, 'editor'] as const,
  /** The live specimen. Keyed by the query string too: the preview is a
   *  function of what is in the form, so two sets of working values are two
   *  cache entries rather than one that flickers between them. */
  libraryPreview: (slug: string, name: string, query: string) =>
    ['library', slug, name, 'preview', query] as const,
  /** `GET /api/accounts` -- case-less, and its own key: the row list moves on
   *  create, disable and reset without anything else moving. */
  accounts: () => ['accounts'] as const,
  credentials: () => ['credentials'] as const,
}
