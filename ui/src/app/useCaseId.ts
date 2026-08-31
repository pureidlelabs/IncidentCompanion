import { useParams } from 'react-router-dom'

/**
 * The case this screen is about, read from the route.
 *
 * A section calls this instead of taking a `caseId` prop. The route guarantees
 * the parameter is present - every path reaching a section has `:caseId` in it
 * - so this throws rather than returning `string | undefined` and making
 * twenty call sites handle an impossible case. The throw is a routing defect,
 * not an analyst-facing state.
 */
export function useCaseId(): string {
  const { caseId } = useParams<{ caseId: string }>()
  if (!caseId) {
    throw new Error('useCaseId() outside a /cases/:caseId route')
  }
  return caseId
}

/** Which section is open. `undefined` only on the index redirect. */
export function useSectionName(): string | undefined {
  return useParams<{ section: string }>().section
}
