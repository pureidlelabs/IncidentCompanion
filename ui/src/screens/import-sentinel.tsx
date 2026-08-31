import { CircleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'

import { ProviderConnect } from '@/components/blocks/provider-connect'
import {
  ProviderImportReview,
  type Candidate,
} from '@/components/blocks/provider-import-review'
import {
  NO_DIALS,
  ProviderIncidentPicker,
  type Dials,
  type RemoteIncident,
} from '@/components/blocks/provider-incident-picker'
import {
  ProviderWorkspacePicker,
  type SourceChoice,
} from '@/components/blocks/provider-workspace-picker'
import { Wizard } from '@/components/blocks/wizard'
import { Section } from '@/components/blocks/section'
import { Button } from '@/components/ui/button'

/**
 * The four-phase importer: connect, pick a workspace, filter incidents, review.
 *
 * **A phase is narrowed by what the wizard has, not by a counter.** No session
 * is connect, no source is the source phase, an empty review is the incidents
 * phase - reached by only ever advancing on the action that produces the thing.
 *
 * **The action row's primary is the phase's own verb.** Sign in, Continue,
 * Fetch detail, Import: a second filled button beside a generic Continue reads
 * as a segmented control, and on three of the four phases the step and the act
 * are the same thing.
 *
 * **Detail is fetched on Continue, not while the analyst reads the list.** One
 * request per selected incident, before the review renders: a review that
 * renders instantly and completely beats one that fills in under a spinner.
 *
 * **Nothing narrows under the keyboard.** The five dials over the listing are a
 * query the provider is asked, so they take effect on Search and not on the
 * keystroke - a table that moves while a filter is half-typed claims a listing
 * nobody requested.
 *
 * **The wizard maps nothing.** It fetched the incident because it holds the
 * provider's token; the candidates, their identity verdicts and the fields they
 * carry are all the server's, computed against the schemas and the case as it
 * stands now.
 */
export interface ImportSentinelScreenProps {
  /** Which phase to draw. */
  phase?: Phase
  /** Whether this install can reach a provider at all. */
  connected?: boolean
  /**
   * The provider needs no registration from the analyst.
   *
   * **Not the same claim as `connected`**, which says a provider is reachable
   * once someone says how to reach it. The bundled fixture -- what
   * `?importer=demo` selects, and how the browser tier walks these phases --
   * needs no tenant and no client id, so requiring them disabled the door on
   * the one path that has nothing to type into it.
   */
  preconfigured?: boolean
  /** Who is signed in. Empty is nobody, which is the state before Sign in. */
  identity?: string
  /**
   * The workspaces the provider listed.
   *
   * **Optional, and absent is the first phase rather than a forgotten wire.**
   * These three arrive from the analyst's own steps through `writes` --
   * `connect`, then `sources()`, then `incidents()`, then `preview()` -- so a
   * caller mounting the importer at its start passes none of them. A story
   * passes one to open the screen at a later phase.
   */
  sources?: readonly SourceChoice[]
  /** The incidents the filter left. */
  incidents?: readonly RemoteIncident[]
  /** What the server says the selected incidents would add. */
  candidates?: readonly Candidate[]
  /** Which incidents are carried into the review on a direct mount. */
  selected?: readonly string[]
  /** The provider's own words for a refused connection or fetch. */
  problem?: string
  /** A request is in flight. */
  busy?: boolean
  /**
   * Omitted in the gallery, where every phase is drawn from fixtures and no
   * provider is reached.
   */
  writes?: SentinelWrites
}

/**
 * What the wizard asks a provider for, one member per phase.
 *
 * **Taken from `IncidentSource` rather than designed here.** That interface
 * already has `connect`, `listSources`, `listIncidents` and `fetchDetail`, and
 * the four phases are those four calls -- a seam shaped any other way would be
 * a second vocabulary for the same conversation. `commit` is the fifth because
 * writing the reviewed rows is this app's call and not the provider's.
 *
 * Each resolves with what the next phase draws, so the screen holds the
 * answers rather than the caller pushing them back in as props.
 */
export interface SentinelWrites {
  /** Signs in against the analyst's own app registration. Resolves the identity. */
  connect: (registration: { tenantId: string; clientId: string }) => Promise<string>
  /** The workspaces that identity can read. */
  sources: () => Promise<readonly SourceChoice[]>
  /** The incidents in the chosen workspace that the dials leave. */
  incidents: (sourceId: string, dials: Dials) => Promise<readonly RemoteIncident[]>
  /** What the selected incidents would add to this case, as the server sees it. */
  preview: (sourceId: string, incidentIds: readonly string[]) => Promise<readonly Candidate[]>
  /** Writes the reviewed rows. */
  commit: (sourceId: string, incidentIds: readonly string[]) => Promise<void>
}

export type Phase = 'connect' | 'source' | 'incidents' | 'review'

const PHASE_ORDER: readonly Phase[] = ['connect', 'source', 'incidents', 'review']

/** Step labels for the rail. `source` takes the provider's own noun. */
const PHASE_LABELS: Readonly<Record<Phase, string>> = {
  connect: 'Connect',
  source: 'Workspace',
  incidents: 'Incidents',
  review: 'Review',
}

/** The phase `index` steps away from the ends of the order. */
function stepAt(index: number): Phase {
  return PHASE_ORDER[Math.min(PHASE_ORDER.length - 1, Math.max(0, index))] ?? 'connect'
}

/**
 * What is wrong with the dials as typed, in the analyst's terms.
 *
 * Sentinel refuses the whole query on a non-numeric incident id, so the filter
 * is dropped rather than sent - and an unsaid drop reads as "no such incident"
 * on an empty table.
 */
function dialWarning(dials: Dials): string {
  const number = dials.number.trim()
  if (number && !/^\d+$/.test(number)) return 'Incident ID must be a number; ignoring that filter'
  return ''
}

/** Four workspaces, one of which shares a name with another tenant's. */
export const DEMO_SOURCES: readonly SourceChoice[] = [
  {
    id: 'ws-1',
    name: 'meridian-soc',
    detail: 'westeurope - rg-security',
    subscription: 'Meridian Production',
    incidents: 42,
  },
  {
    id: 'ws-2',
    name: 'meridian-soc',
    detail: 'northeurope - rg-security-dr',
    subscription: 'Meridian Recovery',
    incidents: 6,
  },
  {
    id: 'ws-3',
    name: 'northwind-ops',
    detail: 'uksouth - rg-northwind',
    subscription: 'Northwind',
    incidents: 18,
  },
  {
    id: 'ws-4',
    name: 'kestrel-health',
    detail: 'westeurope - rg-kestrel',
    subscription: 'Kestrel',
    incidents: 3,
  },
]

/**
 * `2026-08-13 09:14 UTC`, which is the provider's own rendering.
 *
 * Sortable as a string because the wide field leads, which is what lets the
 * Created column sort without parsing a date back out of a cell.
 */
function providerTime(at: Date): string {
  const iso = at.toISOString()
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`
}

/** Hours before this module loaded. Relative, so the window dial has work. */
function hoursAgo(hours: number): string {
  return providerTime(new Date(Date.now() - hours * 3600 * 1000))
}

/**
 * A listing wide enough to filter and to run past the pane.
 *
 * **Deliberately not in date order.** A Created column that sorted the array it
 * was handed would look right against rows that arrived sorted, and the
 * provider returns them in no order this screen may assume.
 */
export const DEMO_INCIDENTS: readonly RemoteIncident[] = [
  {
    id: 'INC-88214',
    number: '88214',
    title: 'Ransomware deployment detected on multiple hosts',
    severity: 'High',
    status: 'Active',
    created: hoursAgo(20),
  },
  {
    id: 'INC-88190',
    number: '88190',
    title: 'Suspicious sign-in from an unfamiliar location',
    severity: 'Medium',
    status: 'Active',
    created: hoursAgo(1),
  },
  {
    id: 'INC-88155',
    number: '88155',
    title: 'Mass file rename by a single account',
    severity: 'High',
    status: 'New',
    created: hoursAgo(100),
  },
  {
    id: 'INC-88101',
    number: '88101',
    title: 'Anomalous data transfer to an external endpoint',
    severity: 'High',
    status: 'Active',
    created: hoursAgo(5),
  },
  {
    id: 'INC-88044',
    number: '88044',
    title: 'Impossible travel activity',
    severity: 'Low',
    status: 'Closed',
    created: hoursAgo(50),
  },
  {
    id: 'INC-87998',
    number: '87998',
    title: 'Malicious attachment blocked at the gateway',
    severity: 'Informational',
    status: 'Closed',
    created: hoursAgo(30),
  },
]

/** What two of those incidents would add. */
export const DEMO_CANDIDATES: readonly Candidate[] = [
  { id: 'c1', incident: 'INC-88214', collection: 'Timeline', label: 'Ransomware deployment detected on multiple hosts', verdict: 'new', fields: 7 },
  { id: 'c2', incident: 'INC-88214', collection: 'Assets', label: 'DC-01', verdict: 'merge', fields: 3 },
  { id: 'c3', incident: 'INC-88214', collection: 'Assets', label: 'FS-02', verdict: 'new', fields: 5 },
  { id: 'c4', incident: 'INC-88214', collection: 'Accounts', label: 'svc-backup', verdict: 'merge', fields: 2 },
  { id: 'c5', incident: 'INC-88155', collection: 'Timeline', label: 'Mass file rename by a single account', verdict: 'new', fields: 6 },
  { id: 'c6', incident: 'INC-88155', collection: 'Network', label: '203.0.113.44', verdict: 'new', fields: 4 },
]

/** The incidents a direct mount at the review carries, being the ones it maps. */
const DEMO_SELECTED: readonly string[] = ['INC-88214', 'INC-88155']

/** The coordinates an install that can reach a provider already has. */
const DEMO_TENANT = 'meridian-logistics.example'
const DEMO_CLIENT = '7b1c0f4e-3a8d-4a11-9f2e-1d5c6b8a0e93'
const DEMO_IDENTITY = 'rin.okafor@meridian-logistics.example'

export function ImportSentinelScreen({
  phase = 'connect',
  connected = false,
  preconfigured = false,
  identity = '',
  sources: sourcesGiven,
  incidents: incidentsGiven,
  candidates: candidatesGiven,
  selected: initialSelected = DEMO_SELECTED,
  problem,
  busy = false,
  writes,
}: ImportSentinelScreenProps) {
  const sources = sourcesGiven ?? []
  const incidents = incidentsGiven ?? []
  const candidates = candidatesGiven ?? []
  const [here, setHere] = useState<Phase>(phase)
  // **Prefilled only where a sign-in has already happened.** An install that
  // can reach a provider has not thereby been given anybody's registration,
  // and a form arriving full reads as configured when nothing was entered.
  const [tenantId, setTenantId] = useState(identity ? DEMO_TENANT : '')
  const [clientId, setClientId] = useState(identity ? DEMO_CLIENT : '')
  const [who, setWho] = useState(identity)
  const [sourceName, setSourceName] = useState('')
  const [subscription, setSubscription] = useState('Any')
  const [source, setSource] = useState(sources[0]?.id ?? '')
  const [dials, setDials] = useState<Dials>(NO_DIALS)
  const [asked, setAsked] = useState<Dials>(NO_DIALS)
  const [selected, setSelected] = useState<readonly string[]>(initialSelected)
  const [imported, setImported] = useState(false)
  /**
   * What the provider answered, seeded from the props the gallery draws.
   *
   * **Held here rather than pushed back in as props**, because each phase's
   * answer is what the next one draws and a caller round-tripping it through
   * its own state would be a second copy of this wizard's position.
   */
  const [listed, setListed] = useState(sources)
  const [found, setFound] = useState(incidents)
  const [previewed, setPreviewed] = useState(candidates)
  const [waiting, setWaiting] = useState(false)
  /** The provider's own words, when a call of ours is what failed. */
  const [refused, setRefused] = useState<string | undefined>(undefined)

  const [given, setGiven] = useState({ sources, incidents, candidates })
  if (given.sources !== sources || given.incidents !== incidents || given.candidates !== candidates) {
    setGiven({ sources, incidents, candidates })
    setListed(sources)
    setSource(sources[0]?.id ?? '')
    setFound(incidents)
    setPreviewed(candidates)
  }

  const at = PHASE_ORDER.indexOf(here)
  const configured = tenantId.trim() !== '' && clientId.trim() !== ''
  const warning = dialWarning(dials)

  const shown = useMemo(() => matching(found, asked), [found, asked])
  const mapped = useMemo(
    () => previewed.filter((one) => selected.includes(one.incident)),
    [previewed, selected],
  )

  /** What the primary does here, and what it is allowed to be called. */
  const primary = {
    // **Signed in already, and the step is a step.** "Sign in" over a line
    // reading "Signed in as rin" is the screen contradicting itself about the
    // one thing this phase is for.
    // A provider with nothing to configure, or one this analyst has told the
    // screen how to reach. Never a reachable provider with no coordinates:
    // `import-sentinel.test.tsx` holds that, and it is the live path's whole
    // precondition.
    connect: {
      label: who ? 'Continue' : 'Sign in',
      ready: preconfigured || (connected && configured),
    },
    source: { label: 'Continue', ready: source !== '' },
    incidents: { label: 'Fetch detail', ready: selected.length > 0 },
    review: {
      label: `Import ${String(mapped.length)} row(s)`,
      ready: mapped.length > 0 && !imported,
    },
  }[here]

  /**
   * The step's own call, then the step.
   *
   * **Nothing advances on a refusal.** A wizard that moves on and then draws
   * the provider's error two phases later is asking the analyst to work out
   * which step failed. Without `writes` the phases move on their own, which
   * is what the gallery walks.
   */
  const advance = () => {
    if (!writes) {
      if (here === 'connect' && !who) setWho(DEMO_IDENTITY)
      if (here === 'review') {
        setImported(true)
        return
      }
      setHere(stepAt(at + 1))
      return
    }

    const step = async () => {
      setWaiting(true)
      setRefused(undefined)
      try {
        if (here === 'connect') {
          setWho(await writes.connect({ tenantId, clientId }))
          const answered = await writes.sources()
          setListed(answered)
          // The pick follows the listing: leaving it on the fixture's first id
          // sends the next phase to a workspace this identity cannot read.
          setSource(answered[0]?.id ?? '')
        } else if (here === 'source') {
          setFound(await writes.incidents(source, dials))
        } else if (here === 'incidents') {
          setPreviewed(await writes.preview(source, selected))
        } else {
          await writes.commit(source, selected)
          setImported(true)
          return
        }
        setHere(stepAt(at + 1))
      } catch (error) {
        setRefused(error instanceof Error ? error.message : 'The provider refused.')
      } finally {
        setWaiting(false)
      }
    }
    void step()
  }

  const disconnect = () => {
    setWho('')
    setSelected([])
    setHere('connect')
  }

  return (
    <Section
      fills
      title="Import incidents"
      blurb="Pull incidents from the provider into this case. Nothing is written until the review is accepted."
    >
      <Wizard
        label="Import phases"
        orientation="horizontal"
        current={here}
        busy={busy || waiting}
        steps={PHASE_ORDER.map((step) => ({ key: step, label: PHASE_LABELS[step] }))}
        actions={
          <>
            <Button
              variant="outline"
              isDisabled={at <= 0 || imported}
              onPress={() => {
                setHere(stepAt(at - 1))
              }}
            >
              Back
            </Button>
            <Button
              data-testid="import-primary"
              variant="default"
              isDisabled={!primary.ready || busy || waiting}
              isPending={busy || waiting}
              onPress={advance}
            >
              {primary.label}
            </Button>
          </>
        }
      >
        {(problem ?? refused) !== undefined && (
          <p className="flex items-center gap-1.5 text-sm text-destructive" role="alert">
            <CircleAlert aria-hidden className="size-4" />
            {problem ?? refused}
          </p>
        )}

        {here === 'connect' && (
          <ProviderConnect
            connected={connected}
            identity={who}
            tenantId={tenantId}
            onTenantId={setTenantId}
            clientId={clientId}
            onClientId={setClientId}
          />
        )}

        {here === 'source' && (
          <ProviderWorkspacePicker
            sources={listed}
            name={sourceName}
            onName={setSourceName}
            subscription={subscription}
            onSubscription={setSubscription}
            value={source}
            onValue={setSource}
            onDisconnect={disconnect}
          />
        )}

        {here === 'incidents' && (
          <ProviderIncidentPicker
            incidents={shown}
            total={incidents.length}
            dials={dials}
            onDials={setDials}
            warning={warning}
            onSearch={() => {
              setAsked(dials)
            }}
            selected={selected}
            onSelected={setSelected}
          />
        )}

        {here === 'review' &&
          (imported ? (
            <p className="text-sm" role="status">
              {`Imported. ${String(mapped.length)} row(s) added to the case.`}
            </p>
          ) : (
            <ProviderImportReview candidates={mapped} />
          ))}
      </Wizard>
    </Section>
  )
}

/**
 * The listing the dials leave.
 *
 * A non-numeric incident id is dropped rather than matched as a label: the
 * provider filters on the incident *number*, so `INC-88214` typed into that box
 * is a filter it would refuse.
 */
function matching(incidents: readonly RemoteIncident[], dials: Dials): readonly RemoteIncident[] {
  const title = dials.title.trim().toLowerCase()
  const number = dials.number.trim()
  const hours = Number(dials.sinceHours)
  const since = hours > 0 ? providerTime(new Date(Date.now() - hours * 3600 * 1000)) : ''
  return incidents.filter(
    (one) =>
      (dials.severity === 'Any' || one.severity === dials.severity) &&
      (dials.status === 'Any' || one.status === dials.status) &&
      (title === '' || one.title.toLowerCase().includes(title)) &&
      (number === '' || !/^\d+$/.test(number) || one.number === number) &&
      (since === '' || one.created >= since),
  )
}
