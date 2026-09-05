import type { CollectionName } from './model'

/**
 * The query-key convention, in four lines. Every screen follows it.
 */

export const keys = {
  cases: () => ['cases'] as const,
  demos: () => ['demos'] as const,
  case: (caseId: string) => ['case', caseId] as const,
  collection: (caseId: string, collection: CollectionName) =>
    ['case', caseId, 'collection', collection] as const,
  entry: (caseId: string, collection: CollectionName, entryId: string) =>
    ['case', caseId, 'collection', collection, entryId] as const,
  /**
   *  invalidates this one (TanStack matches by prefix), so a write hook's
   * existing `keys.case(caseId)` invalidation reaches it with nothing added at
   * the call site.
   */
  attribution: (caseId: string) => ['case', caseId, 'attribution'] as const,
  /**
   * The case's activity feed, under the case key for the same reason
   * attribution is: any write anywhere on the case adds an entry to it, so the
   * whole-case invalidation has to reach it.
   */
  activity: (caseId: string) => ['case', caseId, 'activity'] as const,
  /**
   *  `case(caseId)` like the two around it - but the change feed invalidates
   *  the case key `exact`, so this one is named there rather than reached.
   */
  summary: (caseId: string) => ['case', caseId, 'summary'] as const,
  /**
   *  **Built here and not inline**, which is rule 3 above: spelled out at the
   *  call sites, the change feed had no name to invalidate and another
   *  analyst's compliance write left an open Compliance screen stale until it
   */
  compliance: (caseId: string) => ['case', caseId, 'compliance'] as const,
  /** A refused save's review. Prefixed by `case(caseId)` like the two above,
   *  so answering it - which invalidates the case - clears this too. */
  conflicts: (caseId: string) => ['case', caseId, 'conflicts'] as const,
  collections: () => ['collections'] as const,
  /** Not under a case: the specs document names none and reads none. */
  specs: () => ['specs'] as const,
  /**
   *  switches are install preferences that change while the server runs, so
   */
  regimes: () => ['regimes'] as const,
  /**
   *  one cache entry per language rather than a refetch that overwrites the
   */
  reportBlockKinds: (language: string) => ['report-block-kinds', language] as const,
  /** Keyed by language for `reportBlockKinds`' reason: the layout chips are
   *  named from a language pack. */
  reportLayouts: (language: string) => ['report-layouts', language] as const,
  /** **Not keyed by language**, unlike the three around it: this is the list of
   *  packs an install holds, which every language shares. */
  reportLanguages: () => ['report-languages'] as const,
  /**
   *  each snippet's own file rather than in a language pack: one cache entry
   *  per language, so a Dutch report and an English one do not overwrite each
   */
  reportSnippets: (language: string) => ['report-snippets', language] as const,
  /**
   *  plugin's enabled switch is a preference that changes while the server
   */
  plugins: () => ['plugins'] as const,
  recentCases: () => ['recent-cases'] as const,
  /** Case-less: an analyst's chosen disc colour and initials belong to the
   *  install, and every case's presence stack reads the same answer. */
  appearance: () => ['appearance'] as const,
  /** Case-less like `plugins`: a drop-in registry, module constants for the
   *  life of the process. */
  caseTemplates: () => ['case-templates'] as const,
  /** Case-less: build identity, constant for the life of the process. */
  about: () => ['about'] as const,
  /** The readiness probe, polled rather than invalidated - see `useBackendHealth`. */
  health: () => ['health'] as const,
  /** **Prefixed by `health()` on purpose**, so the Health pane's two reads
   *  refresh together with the probe they sit beside. */
  healthResources: () => ['health', 'resources'] as const,
  healthActivity: () => ['health', 'activity'] as const,
  /**
   *  Keyed under a bare `library` prefix on purpose (TanStack matches by
   */
  library: (slug: string) => ['library', slug] as const,
  /**
   *  dialog can be invalidated without dropping the row list it was opened
   */
  libraryEditor: (slug: string, name: string) =>
    ['library', slug, name, 'editor'] as const,
  /**
   *  function of what is in the form, so two sets of working values are two
   */
  libraryPreview: (slug: string, name: string, query: string) =>
    ['library', slug, name, 'preview', query] as const,
  /** `GET /api/accounts` -- case-less, and separate from `settings`: the row
   *  list moves on create/disable/reset without the settings document moving. */
  accounts: () => ['accounts'] as const,
  /**
   *  and never holding a secret: the mint response is a mutation result, not a
   */
  credentials: () => ['credentials'] as const,
}
