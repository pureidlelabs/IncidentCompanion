import { useParams } from 'react-router-dom'

/**
 * The case this screen is about, read from the route.
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
