/**
 * The Better Auth client. **The only thing in this tier that authenticates.**
 *
 * **No `baseURL`, deliberately.** The client defaults to the page's own
 * origin, which is what makes the dev proxy and the served build behave
 * identically - `vite.config.ts` forwards `/api` to whichever backend it was
 * started against, and a hardcoded origin here would bypass that and send
 * credentials somewhere the proxy is standing in for. The server relies on
 * the same property: its trusted origins are the base URL's own.
 * -> `server/src/auth/trusted-origins.ts`
 *
 * **`/api/auth` is Better Auth's mount, not a path this app chose**, and it
 * has to match `AuthModule`'s on the server. The two are set independently and
 * a mismatch surfaces as every auth call 404ing, which reads as the server
 * being down.
 */
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  basePath: '/api/auth',
  fetchOptions: {
    /**
     * **Resolved per call, so a test's `fetch` stub is seen.** The client
     * otherwise captures `fetch` when this module loads, before
     * `vi.stubGlobal` runs - and the symptom is not a failed assertion but a
     * *real* network call from the unit tier, surfacing as
     * `TypeError: fetch failed` with a connection error underneath. That reads
     * as the dev server being down rather than as an un-mocked client.
     *
     * Identical behaviour in the browser: the indirection only defers the
     * lookup.
     */
    customFetchImpl: (input, init) => globalThis.fetch(input as RequestInfo, init),
  },
})

export const { signIn, signOut, signUp, useSession } = authClient
