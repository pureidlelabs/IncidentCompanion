/**
 * The bounds this install sets on its own security controls.
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
 */
export function stepsWithin(bound: Bound | undefined, steps: readonly number[]): string[] {
  if (!bound) return []
  const inside = steps.filter((one) => one >= bound.floor && one <= bound.ceiling)
  // The value the install is actually set to always appears, even when it is
  // not one of the steps - otherwise the control shows a blank for a real
  // setting somebody chose through the API.
  return [...new Set([...inside, bound.value])].sort((a, b) => a - b).map(String)
}
