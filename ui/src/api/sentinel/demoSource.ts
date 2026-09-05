/**
 * The built-in demo source, asked for by the URL.
 *
 * **Because the browser tier cannot sign in to Azure.** The live source needs
 * an interactive Entra sign-in and a directory to sign in to, so a Playwright
 * run has no way to reach the wizard's later phases -- and those phases are
 * where the import actually happens. `?importer=demo` selects the fixture
 * source instead, which answers from data in the bundle and makes no request
 * of any kind.
 *
 * **It is not a privilege bypass, and that is worth stating plainly.** The rows
 * it produces are written through the same import routes, under the analyst's
 * own session, with every guard those routes apply. Anything it can put in a
 * case, the analyst could type by hand. What it skips is the provider, not a
 * check.
 *
 * It doubles as a demo: an install with no Azure tenant can still show what the
 * import does.
 */
import { fixtureSource } from './fixtureSource'
import type { IncidentSource } from './source'

/** The value that selects it, spelled once. */
export const DEMO_IMPORTER = 'demo'

/**
 * The demo source when the URL asks for it, `null` otherwise.
 *
 * Read from `location.search` rather than from a router hook, because both
 * doors that need it sit outside the case router -- and the answer is a fact
 * about the address, not about the route.
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
