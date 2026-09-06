import { useMemo, type ReactNode } from 'react'

import { useAttribution } from '@/api/attribution'
import { useCasePresence } from '@/api/presence'
import { useCaseChanges } from '@/api/useCaseChanges'
import { AttributionProvider } from '@/components/blocks/detail-grid'
import { EntityCardProvider } from '@/components/blocks/entity-card'
import { ClaimsProvider, type RowClaims } from '@/components/blocks/presence'
import { useSession } from '@/api/useSession'
import { SectionActionsProvider } from '@/app/case/sectionActions'

import type { Attribution } from '@/api/attribution'

/**
 * The context a case screen reads from, in one place for both callers.
 *
 * The app's case layer and `fixtures/in-a-case.tsx` drift the way
 * `AppProviders` can a tier up: the app wraps a screen in attribution, claims
 * and the section-action registry, and a fixture supplying `EntityCardProvider`
 * alone shows a row with no "edited 2m ago" and no claim -- the multi-user half
 * of the product missing from the gallery that exists to show it.
 *
 * **It takes values and fetches nothing**, which is what lets a story mount it.
 * `CaseProvidersLive` below is the half that reads a server, and it is the
 * app's alone -- the same split as a screen and its container, one tier out.
 */
export function CaseProviders({
  caseId,
  attribution,
  claims,
  children,
}: {
  caseId: string
  /** Who last wrote each row. A story passes a fixture or nothing. */
  attribution?: Attribution | undefined
  /** Who holds which row, and who you are. */
  claims: RowClaims
  children: ReactNode
}) {
  return (
    <EntityCardProvider caseId={caseId}>
      {/* An expanded row gains "edited 2m ago by ..." without any of the ten
          screens that draw one knowing the feature exists. */}
      <AttributionProvider value={attribution}>
        <ClaimsProvider value={claims}>
          <SectionActionsProvider>{children}</SectionActionsProvider>
        </ClaimsProvider>
      </AttributionProvider>
    </EntityCardProvider>
  )
}

/** Nobody holds anything and you are nobody: what a story mounts. */
export const NO_CLAIMS: RowClaims = {
  holderOf: () => undefined,
  claim: () => undefined,
  release: () => undefined,
  you: undefined,
}

/**
 * `CaseProviders` reading the case it is given, for the app.
 *
 * Subscribing here rather than in each section: a section that is not on
 * screen still holds a cached query, and that is the one the analyst meets
 * stale when they navigate back to it.
 */
export function CaseProvidersLive({
  caseId,
  children,
}: {
  caseId: string
  children: ReactNode
}) {
  useCaseChanges(caseId)
  const attribution = useAttribution(caseId)
  const presence = useCasePresence(caseId)
  const me = useSession()?.userId

  // One object, memoised: it is a context value, so a fresh literal every
  // render re-renders every row in every table on this case.
  const claims = useMemo<RowClaims>(
    () => ({
      holderOf: presence.holderOf,
      claim: presence.claim,
      release: presence.release,
      you: me,
    }),
    [presence.holderOf, presence.claim, presence.release, me],
  )

  return (
    <CaseProviders caseId={caseId} attribution={attribution.data} claims={claims}>
      {children}
    </CaseProviders>
  )
}
