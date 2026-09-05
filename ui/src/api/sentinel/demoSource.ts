/**
 * The built-in demo source, asked for by the URL.
 */
import { fixtureSource } from './fixtureSource'
import type { IncidentSource } from './source'

/** The value that selects it, spelled once. */
export const DEMO_IMPORTER = 'demo'

/**
 * The demo source when the URL asks for it, `null` otherwise.
 */
let cached: { search: string; source: IncidentSource | null } | null = null

export function demoSourceFromUrl(search = globalThis.location.search): IncidentSource | null {
  // **One source per address, and a fresh read whenever the address changes.**
  // A caller holding this across renders needs a stable object -- a new
  // `fixtureSource()` every render invalidates every memo downstream of it.
  // Caching in the *caller* is what does not work: the browser tier opens the
  // section and only then navigates to `?importer=demo`, with no remount, so a
  // `useMemo(..., [])` answers `null` for ever and the wizard never reaches
  // its later phases.
  if (cached?.search === search) return cached.source
  const source =
    new URLSearchParams(search).get('importer') === DEMO_IMPORTER ? fixtureSource() : null
  cached = { search, source }
  return source
}
