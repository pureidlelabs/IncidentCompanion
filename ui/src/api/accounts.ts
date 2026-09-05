/**
 * `/api/accounts` - the install's analyst accounts.
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
  /** "active", "locked out" or "disabled" - served resolved, never derived. */
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
 * One mutation per control.
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
