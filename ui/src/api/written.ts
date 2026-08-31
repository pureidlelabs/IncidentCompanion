/**
 * The `Written` refusal idiom, shared by the account and credential writes.
 *
 * A 422 refusal is unwrapped back into `{ok, messages}` rather than thrown,
 * because the served sentence is the control's to show beside itself, not an
 * error boundary's. Anything that is not a `Written` body (401, a network
 * failure) still throws.
 */

import { ApiError, request } from './client'
import type { Written } from './library'

function isWritten(body: unknown): body is { ok: boolean; messages: [string, string][] } {
  return (
    typeof body === 'object' &&
    body !== null &&
    'ok' in body &&
    'messages' in body &&
    Array.isArray((body as { messages: unknown }).messages)
  )
}

/** POST one route and answer its `Written` whether the server said 200 or
 *  422. `T` widens for the one response that carries more (`Minted`). */
export async function postWritten<T extends Written = Written>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  try {
    return await request<T>(path, { method: 'POST', body })
  } catch (error) {
    if (error instanceof ApiError && error.status === 422 && isWritten(error.body)) {
      // A refusal never carries `T`'s extra fields (`Minted.secret` exists on
      // success only), so the refusal shape is the whole of what `T` holds here.
      return error.body as unknown as T
    }
    throw error
  }
}

/** `Written`'s two message levels, split for rendering: a refusal goes in the
 *  control's problem slot, everything else under it in muted text. */
export function splitWritten(written: Written | undefined) {
  const messages = written?.messages ?? []
  return {
    problem:
      messages
        .filter(([, level]) => level === 'negative')
        .map(([text]) => text)
        .join(' ') || undefined,
    note:
      messages
        .filter(([, level]) => level !== 'negative')
        .map(([text]) => text)
        .join(' ') || undefined,
  }
}
