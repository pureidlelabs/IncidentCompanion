import { ApiError } from '@/api/client'

/**
 * A thrown value as a sentence the auth screens can draw above their form.
 */
export function refusalOf(error: unknown): string {
  return error instanceof ApiError ? error.message : 'IncidentCompanion did not answer.'
}
