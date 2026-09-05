/**
 * Reading a stubbed `fetch` call's arguments, without stringifying an object.
 *
 * **`String(url)` is wrong for two of the three things fetch accepts.** The
 * first argument is `string | URL | Request`; a `Request` stringifies to
 * `[object Request]`, so `expect(String(url)).toContain('/api/x')` fails
 * against a value that is *right* -- and passes against nothing, which is the
 * shape a test author reads as "the call was not made". `@typescript-eslint`'s
 * `no-base-to-string` names it, and eleven call sites had it.
 *
 * The body is the same in the other direction: `BodyInit` covers `Blob`,
 * `FormData` and a stream, and `JSON.parse(String(body))` on any of them throws
 * from inside a helper rather than saying which request carried what.
 */

/** The URL a fetch call was made against, whichever form it was passed in. */
export function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

/**
 * A JSON request body, parsed.
 *
 * **Throws rather than returning null**, because every caller is about to
 * assert on a field: a null here surfaces as `Cannot read properties of null`
 * one line later, naming the property instead of the missing request.
 */
export function jsonBody(init: RequestInit | undefined): Record<string, unknown> {
  const body = init?.body
  if (typeof body !== 'string') {
    throw new Error(`expected a JSON string body, got ${typeof body}`)
  }
  return JSON.parse(body) as Record<string, unknown>
}
