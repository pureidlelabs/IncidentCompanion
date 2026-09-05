import { useSyncExternalStore } from 'react'

import { getSession, subscribe, type Session } from '@/api/session'

/**
 * Who is signed in, as React state.
 */
export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, getSession, getSession)
}
