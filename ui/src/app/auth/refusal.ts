import { ApiError } from '@/api/client'

/**
 * A thrown value as a sentence the auth screens can draw above their form.
 *
 * The server's own message wherever there is one: it folds unknown, wrong,
 * disabled and locked-out into a single answer on purpose, and a container
 * that rewrote it would either leak which of the four it was or replace a
 * precise refusal with a guess.
 *
 * Everything else - a dropped connection, a proxy that answered HTML - reaches
 * the same `catch` carrying `fetch failed`, which names the browser's problem
 * rather than the analyst's.
 */
export function refusalOf(error: unknown): string {
  return error instanceof ApiError ? error.message : 'IncidentCompanion did not answer.'
}
