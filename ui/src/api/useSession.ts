import { useSyncExternalStore } from 'react'

import { getSession, subscribe, type Session } from '@/api/session'

/**
 * Who is signed in, as React state.
 *
 * `useSyncExternalStore` rather than context: `client.ts` reads and clears the
 * identity from outside React - a 401 arrives in a query function, not in a
 * component - so the store has to exist outside the tree. Context would put a
 * second copy of the answer in it.
 *
 * **Not `authClient.useSession`.** That one re-probes the server and is the
 * authority; this is the cache it fills, and it is what every screen reads so
 * that no screen waits on a request to know whose name to draw.
 */
export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, getSession, getSession)
}
