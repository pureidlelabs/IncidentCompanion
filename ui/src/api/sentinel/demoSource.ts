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
import type { IncidentSource } from './source'

/** The value that selects it, spelled once. */
export const DEMO_IMPORTER = 'demo'

/**
 * Whether the address asks for the demo importer.
 *
 * Separate from the source because a render needs the answer and not the
 * fixture -- asking for the source instead is what fetches its chunk.
 */
export function demoImporterAsked(search = globalThis.location.search): boolean {
  return new URLSearchParams(search).get('importer') === DEMO_IMPORTER
}

/**
 * The demo source when the URL asks for it, `null` otherwise.
 *
 * Read from `location.search` rather than from a router hook, because both
 * doors that need it sit outside the case router -- and the answer is a fact
 * about the address, not about the route.
 *
 * **Resolving this fetches the fixture's own chunk**, so it is called from the
 * connect phase rather than from a render.
 */
let cached: { search: string; source: Promise<IncidentSource> | null } | null = null

export function demoSourceFromUrl(
  search = globalThis.location.search,
): Promise<IncidentSource | null> {
  // **One source per address, and a fresh read whenever the address changes.**
  // A caller holding this across renders needs a stable object -- a new
  // `fixtureSource()` every render invalidates every memo downstream of it.
  // Caching in the *caller* is what does not work: the browser tier opens the
  // section and only then navigates to `?importer=demo`, with no remount, so a
  // `useMemo(..., [])` answers `null` for ever and the wizard never reaches
  // its later phases. The promise is what is kept, so a second call while the
  // chunk is still arriving gets the same one.
  if (cached?.search !== search) {
    cached = {
      search,
      source: demoImporterAsked(search)
        ? import('@/fixtures/sentinel-source')
            .then((module) => module.fixtureSource())
            .catch((error: unknown) => {
              // A chunk that failed to arrive is not an answer. Kept, it would
              // be replayed to every later call, and the Connect phase's retry
              // could never reach the fixture again.
              if (cached?.search === search) cached = null
              throw error
            })
        : null,
    }
  }
  return Promise.resolve(cached.source)
}
