/**
 * The bounds this install sets on its own security controls.
 *
 * **Every value is served with its floor and its ceiling**, so a screen states
 * what the server refuses rather than hard-coding it and drifting. A ceiling
 * is what stops a setting turning its control off: a lockout threshold of a
 * million is a control that never fires while the screen still shows a number.
 */
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'

import { request } from './client'

export interface Bound {
  value: number
  floor: number
  ceiling: number
}

export interface PolicyView {
  settings: Record<string, Bound>
}

const KEY = ['install-policy'] as const

export function usePolicy(): UseQueryResult<PolicyView> {
  return useQuery({ queryKey: KEY, queryFn: () => request<PolicyView>('/install/policy') })
}

/**
 * Set one bound.
 *
 * **The route answers with every bound**, so the cache is set from its reply
 * rather than invalidated - one round trip, and a control cannot flick back to
 * its old value while a refetch is in flight.
 */
export function useSetPolicy() {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: number }) =>
      request<PolicyView>('/install/policy', { method: 'PUT', body: { key, value } }),
    onSuccess: (served) => {
      cache.setQueryData(KEY, served)
      // The change wrote a line into the activity log.
      void cache.invalidateQueries({ queryKey: ['install-activity'] })
    },
  })
}

/**
 * The steps a bound is offered in, inside what the server allows.
 *
 * **Steps rather than a number field**, for the reason the retention windows
 * are: every value between them is a choice nobody makes deliberately, and a
 * free number is one typo from the floor.
 */
export function stepsWithin(bound: Bound | undefined, steps: readonly number[]): string[] {
  if (!bound) return []
  const inside = steps.filter((one) => one >= bound.floor && one <= bound.ceiling)
  // The value the install is actually set to always appears, even when it is
  // not one of the steps - otherwise the control shows a blank for a real
  // setting somebody chose through the API.
  return [...new Set([...inside, bound.value])].sort((a, b) => a - b).map(String)
}
