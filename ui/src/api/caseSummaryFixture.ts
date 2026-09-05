import type { CaseSummary } from './case'

/**
 * A `CaseSummary` for a test or a story, with only the fields under test named.
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
