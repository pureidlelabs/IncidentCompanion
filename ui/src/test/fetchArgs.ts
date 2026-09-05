/**
 * Reading a stubbed `fetch` call's arguments, without stringifying an object.
 */

/** The URL a fetch call was made against, whichever form it was passed in. */
export function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

/**
 * A JSON request body, parsed.
 */
export function jsonBody(init: RequestInit | undefined): Record<string, unknown> {
  const body = init?.body
  if (typeof body !== 'string') {
    throw new Error(`expected a JSON string body, got ${typeof body}`)
  }
  return JSON.parse(body) as Record<string, unknown>
}
