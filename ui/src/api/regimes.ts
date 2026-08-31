/**
 * `GET /api/regimes` - which regulatory regimes this install surfaces.
 *
 * **Its own query, deliberately not part of `useSpecs`.** The specs document is
 * a serialisation of module constants and is held at `staleTime: Infinity` on
 * that promise; these are `prefs.install()` preferences an analyst changes in
 * Settings while the server runs. Folded into that cache they would be correct
 * at the first fetch and silently wrong for the rest of the session.
 *
 * So this one refetches on window focus and carries no `staleTime`: coming back
 * to the tab after changing a switch in the other one is exactly the case, and
 * the body is three booleans.
 */

import { useMutation, useQueryClient, useQuery, type UseQueryResult } from '@tanstack/react-query'

import { request } from './client'
import { keys } from './queryKeys'

export interface Regime {
  label: string
  /** The master switch and this regime's own, ANDed - what a screen acts on. */
  enabled: boolean
  /** This regime's own switch, ignoring the master. What a settings control renders. */
  preference: boolean
}

export interface Regimes {
  /** The master switch: whether compliance is surfaced at all. */
  enabled: boolean
  regimes: Readonly<Record<string, Regime>>
}

/** `{regime: enabled}`, the shape `complianceCards` takes. */
export function enabledRegimes(regimes: Regimes | undefined): Readonly<Record<string, boolean>> {
  // The document itself, not just the query state: a body without `regimes`
  // is a misrouted response, and `Object.entries(undefined)` unmounts the
  // screen asking rather than leaving every regime off.
  const served: Regimes['regimes'] | undefined = regimes?.regimes
  if (!served) return {}
  return Object.fromEntries(
    Object.entries(served).map(([name, regime]) => [name, regime.enabled]),
  )
}

/** Whether one regime is on, from a document that may not have arrived.
 *
 * `enabledRegimes` walks `regimes.regimes` and throws on a body missing it;
 * a screen asking about one switch should render without it, not unmount. */
export function regimeEnabled(regimes: Regimes | undefined, name: string): boolean {
  return enabledRegimes(regimes)[name] ?? false
}

export function useRegimes(): UseQueryResult<Regimes> {
  return useQuery({
    queryKey: keys.regimes(),
    // `raw`: `regimes` is keyed by regime name, which is data, not a field.
    queryFn: () => request<Regimes>('/regimes', { raw: true }),
  })
}

/**
 * Turn one regime on or off.
 *
 * **The route answers with every regime**, so the cache is set from its reply
 * rather than invalidated - one round trip, and the switch cannot flick back
 * while a refetch is in flight.
 */
export function useSetRegime() {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      request<Regimes>(`/regimes/${encodeURIComponent(name)}`, {
        method: 'POST',
        body: { enabled },
      }),
    onSuccess: (served) => {
      cache.setQueryData(keys.regimes(), served)
      // A regime decides which compliance sections a case shows.
      void cache.invalidateQueries({ queryKey: ['specs'] })
    },
  })
}
