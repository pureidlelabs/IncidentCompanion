import { useNavigate, useSearchParams } from 'react-router-dom'

import { downloadArchive, useExportArchive } from '@/api/archive'
import { useCase } from '@/api/case'
import { useSpecs } from '@/api/specs'
import { useCaseId } from '@/app/useCaseId'
import { CaseArchiveScreen } from '@/screens/case-archive'
import { IndicatorsScreen } from '@/screens/indicators'
import { InvestigationGraphScreen } from '@/screens/investigation-graph'
import { KillchainCoverageScreen } from '@/screens/killchain-coverage'
import { SearchScreen } from '@/screens/search'
import { TimelineGraphScreen } from '@/screens/timeline-graph'

import type { Case } from '@/api/model'

/**
 * The case views that read and never write, bound to the case they draw.
 *
 * **One file, because each component renders only the screen it imports** --
 * which is what `a-container-draws-nothing.rule.test.ts` asks. Four files
 * differing by one screen name and one navigation callback would be four
 * places to keep in step.
 *
 * Each passes `busy`/`problem`/`onRetry` rather than gating the render itself:
 * a container that drew its own boundary would show a pending state the
 * gallery has never seen, which is the guarantee that rule exists to keep.
 */

/** The case's own read, which all four of these draw from. */
function useCaseRead() {
  const caseId = useCaseId()
  const kase = useCase(caseId)
  return {
    caseId,
    bound: {
      kase: kase.data,
      busy: kase.isPending,
      ...(kase.error === null ? {} : { problem: kase.error }),
      onRetry: () => {
        void kase.refetch()
      },
    },
  }
}

export function KillchainCoverageContainer() {
  const { bound } = useCaseRead()
  const specs = useSpecs()
  return (
    <KillchainCoverageScreen
      {...bound}
      specs={specs.data}
      busy={bound.busy || specs.isPending}
    />
  )
}

export function InvestigationGraphContainer() {
  const { bound } = useCaseRead()
  const specs = useSpecs()
  const [params] = useSearchParams()
  const selected = params.get('highlight')
  return (
    <InvestigationGraphScreen
      {...bound}
      specs={specs.data}
      busy={bound.busy || specs.isPending}
      {...(selected ? { selected } : {})}
    />
  )
}

export function TimelineGraphContainer() {
  const { caseId, bound } = useCaseRead()
  const navigate = useNavigate()
  return (
    <TimelineGraphScreen
      {...bound}
      onOpenTimeline={() => {
        void navigate(`/cases/${encodeURIComponent(caseId)}/timeline`)
      }}
    />
  )
}

/**
 * Which rail slug a search group's rows are read on.
 *
 * **Keyed on the case field, because that is what a hit carries** -- the
 * screen groups by `keyof Case` and knows nothing about routes. Routing is the
 * container's business, so the map is here rather than in `case-search.ts`,
 * and `entityTargets` does not answer it: that registry is keyed by entity
 * kind and has no row for the timeline, impact, actions or notes.
 */
const SLUG_OF: Readonly<Partial<Record<keyof Case, string>>> = {
  timeline: 'timeline',
  systems: 'assets',
  accounts: 'accounts',
  networkIndicators: 'network',
  impact: 'impact',
  malware: 'malware',
  cloudApps: 'cloud-apps',
  evidence: 'evidence',
  actions: 'actions',
  casenotes: 'notes',
}

export function IndicatorsContainer() {
  const { bound } = useCaseRead()
  const specs = useSpecs()
  return (
    <IndicatorsScreen
      {...bound}
      specs={specs.data}
      busy={bound.busy || specs.isPending}
    />
  )
}

/**
 * The archive export, which is the one view here that writes.
 *
 * `exporting` and `busy` are two different waits and the screen draws them
 * differently -- the button spins for the export, the body is withheld for the
 * read. A refused export is `refusal` and a failed read is `problem`, for the
 * same reason.
 */
export function CaseArchiveContainer() {
  const { caseId, bound } = useCaseRead()
  const exporting = useExportArchive(caseId)
  return (
    <CaseArchiveScreen
      {...bound}
      exporting={exporting.isPending}
      {...(exporting.error ? { refusal: exporting.error.message } : {})}
      onExport={({ passphrase, files }) => {
        exporting.mutate(
          { passphrase, includeFiles: files },
          { onSuccess: downloadArchive },
        )
      }}
    />
  )
}

export function SearchContainer() {
  const { caseId, bound } = useCaseRead()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const query = params.get('q')
  return (
    <SearchScreen
      {...bound}
      {...(query ? { query } : {})}
      onOpenSection={(section) => {
        const slug = SLUG_OF[section as keyof Case]
        if (slug) void navigate(`/cases/${encodeURIComponent(caseId)}/${slug}`)
      }}
    />
  )
}
