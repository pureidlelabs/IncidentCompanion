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

import type { ApiError } from './client'
import { request } from './client'
import type { Written } from './library'
import { keys } from './queryKeys'
import { postWritten } from './written'

export interface AccountRow {
  username: string
  displayName: string
  role: string
  /** `"active"` or `"disabled"`, resolved by the server, never derived here. */
  state: string
  tone: string
  disabled: boolean
}

export interface AccountsView {
  accounts: AccountRow[]
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
 *
 * **`useAccountWrite` cannot serve a table.** It binds `path` when the hook
 * runs, which suits one control per rendered row and not one control shared by
 * every row - and its empty path is *create*, so a table deriving the path from
 * a nullable "which row" would mint an account on a mistaken call. The username
 * travels in the variables here, where there is no empty value to fall back to.
 *
 * Enable alone, because it is the one account write with no dialog in front of
 * it: restoring access takes nothing away, so there is nothing to confirm.
 */
export function useAccountEnable(): UseMutationResult<Written, ApiError, string> {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (username) =>
      postWritten(`/accounts/${encodeURIComponent(username)}/enable`, {}),
    onSettled: () => client.invalidateQueries({ queryKey: keys.accounts() }),
  })
}

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
