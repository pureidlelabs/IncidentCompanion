/**
 * The Better Auth client. **The only thing in this tier that authenticates.**
 */
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  basePath: '/api/auth',
  fetchOptions: {
    /**
     * **Resolved per call, so a test's `fetch` stub is seen.**
     */
    customFetchImpl: (input, init) => globalThis.fetch(input as RequestInfo, init),
  },
})

export const { signIn, signOut, signUp, useSession } = authClient
