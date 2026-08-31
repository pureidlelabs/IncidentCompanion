import type { CaseSummary } from './case'

/**
 * A `CaseSummary` for a test or a story, with only the fields under test named.
 *
 * **Built because widening the served summary broke eleven literals at once.**
 * `GET /cases` gained five fields it had been dropping, and every fixture that
 * had spelled out the four-field shape stopped compiling - none of them caring
 * about the new ones. A factory is what makes the next widening one edit.
 *
 * Defaults are deliberately inert rather than realistic: an empty `updatedAt`
 * gives a test that has not thought about ordering the unordered case rather
 * than an accidental one, and `null` for the optional fields makes a component
 * that cannot survive them fail here rather than in a browser.
 */
export function aCaseSummary(fields: Partial<CaseSummary> = {}): CaseSummary {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    // **Null, not `''`.** The server sends null for a case with no ticket and
    // no customer yet, and a fixture defaulting to empty strings hides every
    // place that forgets to handle it - which is exactly the crash that
    // reached the browser when these became real nullable columns.
    reference: null,
    customer: null,
    title: '',
    summary: null,
    status: 'open',
    openedAt: '',
    closedAt: null,
    isDemo: false,
    version: 1,
    updatedAt: '',
    ...fields,
  }
}
