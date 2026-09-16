/**
 * `/api/accounts` - the install's analyst accounts.
 *
 * The rows arrive with `state` and `tone` already resolved, so nothing here
 * re-derives a state from `disabled`. The guards (last enabled admin,
 * self-disable, the admin gate itself) also live server-side; this module's
 * job is to carry their sentences back to the control that asked, so no
 * control is disabled preemptively.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'

import type { AnalystAccount } from '@contract/analyst-account'

import type { ApiError } from './client'
import { request } from './client'
import type { Written } from './library'
import { keys } from './queryKeys'
import { postWritten } from './written'

export interface AccountsView {
  accounts: AnalystAccount[]
  roles: string[]
  defaultRole: string
}

export function useAccounts(): UseQueryResult<AccountsView> {
  return useQuery({
    queryKey: keys.accounts(),
    queryFn: () => request<AccountsView>('/accounts'),
  })
}

/**
 * Enable one account, named at mutate time rather than at hook-call time.
/**
 * One mutation per control. `path` is the suffix after `/accounts` - `''`
 * creates, and `/{username}/{verb}` acts on one row - and
 * every write invalidates the one accounts key **on refusal too**, the
 * settings pane's rule: the only recovery a row has is showing what is
 * actually stored.
 */
export function useAccountWrite(
  path: string,
): UseMutationResult<Written, ApiError, Record<string, unknown>> {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body) => postWritten(`/accounts${path}`, body),
    onSettled: () => client.invalidateQueries({ queryKey: keys.accounts() }),
  })
}

/**
 * One mutation for the row actions, which name their account when pressed.
 *
 * `useAccountWrite` fixes its path when the hook is called, which suits the
 * create door and cannot say *disable whichever row this was*. Invalidates the
 * same key on refusal too, for the reason the create does: the only recovery a
 * row has is showing what is actually stored.
 */
export function useAccountAction(): UseMutationResult<
  Written,
  ApiError,
  { path: string; body?: Record<string, unknown> }
> {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ path, body }) => postWritten(`/accounts${path}`, body ?? {}),
    onSettled: () => client.invalidateQueries({ queryKey: keys.accounts() }),
  })
}
