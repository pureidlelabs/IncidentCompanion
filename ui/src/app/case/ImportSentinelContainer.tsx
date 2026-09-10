import { useMemo, useRef } from 'react'

import {
  commitImport,
  startCaseFromIncident,
  previewImport,
  type RawIncident,
  type TimelineCandidate,
} from '@/api/incidentImport'
import { useParams } from 'react-router-dom'
import { armSource } from '@/api/sentinel/armSource'
import { demoSourceFromUrl } from '@/api/sentinel/demoSource'
import { msalTokenProvider } from '@/api/sentinel/msalTokenProvider'
import { ImportSentinelScreen, type SentinelWrites } from '@/screens/import-sentinel'

import type { Candidate } from '@/components/blocks/provider-import-review'
import type { RemoteIncident as PickerIncident } from '@/components/blocks/provider-incident-picker'
import type {
  ImporterSession,
  IncidentSource,
  ImportSource,
  RemoteIncident,
} from '@/api/sentinel/source'

/**
 * `ImportSentinelScreen` driven against a real provider.
 *
 * **This file is a translation, and that is the whole of its size.** The
 * provider, the server and the screen each name the same things differently:
 * an `ImportSource` has a `key` where the picker draws an `id`, the provider's
 * `RemoteIncident` has no `id` at all, and the served preview's verdict says
 * `existing` where the review says `merge`. None of that is invented here --
 * each mapping is between two shapes that already exist.
 *
 * **The client maps nothing else.** It fetches the incident because it holds
 * the provider's token and posts what the provider sent; the server parses it
 * against the collections' schemas and judges it against the case as it stands
 * at that moment. -> `api/incidentImport.ts`
 *
 * The session and the listing are refs: nothing on screen is drawn from
 * either, so holding them in state would re-render the wizard for a value only
 * the next call reads.
 */
/**
 * A selection and the case it belongs to, as one value, so two can be told
 * apart.
 *
 * **The case is in it.** Without that the guard compares incident keys alone,
 * and a plan reviewed against one case would satisfy a commit into another --
 * reachable only by a route that does not unmount the wizard, which is a fact
 * about the router rather than about this file.
 */
const keyOf = (caseId: string, incidentIds: readonly string[]): string =>
  [caseId, ...incidentIds].join('\u001f')

export function ImportSentinelContainer({
  startsACase = false,
  onCreated,
  onOpenChange,
}: {
  /**
   * The wizard makes the case rather than filling one.
   *
   * **The four phases before the ending are the same conversation**, which is
   * why one container serves both: only the last call differs, and a second
   * container would be this file's translation written twice. -> #420
   */
  startsACase?: boolean
  onCreated?: (caseId: string) => void
  /** Closing the door that makes a case. */
  onOpenChange?: (open: boolean) => void
} = {}) {
  // `useParams` rather than `useCaseId`, which throws off a case route -- and
  // the door that starts a case is mounted from the picker, where there is
  // none yet.
  const { caseId = '' } = useParams<{ caseId: string }>()
  /**
   * The bundled fixture, when the address asks for it.
   *
   * `?importer=demo` is what makes the wizard reachable without an interactive
   * Entra sign-in, which is how the browser tier walks the four phases. It
   * needs no registration, so the connect phase is open on it.
   */
  const bundled = demoSourceFromUrl()
  /**
   * **Built at `connect`, from what the analyst typed.** The registration is
   * the screen's to collect and this file's to turn into a source -- building
   * it from stored coordinates before the phase runs is what left the door
   * disabled with nothing on screen saying why.
   */
  const provider = useRef<IncidentSource | null>(bundled)
  const session = useRef<ImporterSession | null>(null)
  const workspaces = useRef<readonly ImportSource[]>([])
  /** The incidents the last listing returned, by the id the screen hands back. */
  const listing = useRef<ReadonlyMap<string, RemoteIncident>>(new Map())
  /**
   * The plan the analyst reviewed, and the payload it was drawn from.
   *
   * **The commit writes what the review showed, and asks the provider
   * nothing.** Fetching the incidents a second time is a second read: an alert
   * the provider gained between the two arrives in the commit body, is
   * approved with the rest, and is written having never been on screen --
   * which `openspec/specs/incident-import/spec.md` refuses.
   *
   * `for` is the selection it was built against, so a plan that does not
   * belong to what is being committed is refused rather than written.
   */
  const reviewed = useRef<{
    for: string
    payload: { provider: 'sentinel'; incidents: RawIncident[] }
  } | null>(null)

  const chosen = (id: string): ImportSource | undefined =>
    workspaces.current.find((one) => one.key === id)

  /** The provider's incident as the picker draws it. `key` is the identity. */
  const forPicker = (one: RemoteIncident): PickerIncident => ({
    id: one.key,
    number: one.number,
    title: one.title,
    severity: one.severity,
    status: one.status,
    created: one.created,
  })

  /**
   * A served preview row as the review draws it.
   *
   * `verdict` is renamed rather than reinterpreted -- the server's `existing`
   * is a row the case already holds, which is exactly what the review calls a
   * merge. `fields` is a count here and the values there.
   */
  const forReview = (one: {
    id: string
    incident: string
    collection: string
    label: string
    verdict: 'existing' | 'new'
    fields: Record<string, unknown>
    checked: boolean
  }): Candidate => ({
    id: one.id,
    incident: one.incident,
    collection: one.collection,
    label: one.label,
    verdict: one.verdict === 'existing' ? 'merge' : 'new',
    fields: Object.keys(one.fields).length,
    checked: one.checked,
  })

  /**
   * A timeline entry as the review draws it.
   *
   * **The preview answers two lists and both are written**, so both are shown.
   * A timeline entry carries no verdict and no collection: the server matches
   * an entity against what the case holds and a timeline row against nothing,
   * so every one of them is new. -> #392
   */
  const timelineForReview = (one: TimelineCandidate): Candidate => ({
    id: one.id,
    incident: one.incident,
    collection: 'timeline',
    label: one.label,
    verdict: 'new',
    fields: Object.keys(one.fields).length,
    checked: one.checked,
  })

  /** The selected incidents, fetched in full, in the shape the server takes. */
  const detailed = async (
    workspace: ImportSource,
    incidentIds: readonly string[],
  ): Promise<RawIncident[]> => {
    if (!session.current || !provider.current) throw new Error('Sign in before importing.')
    const held = session.current
    const reached = provider.current
    const wanted = incidentIds
      .map((id) => listing.current.get(id))
      .filter((one): one is RemoteIncident => one !== undefined)
    return Promise.all(
      wanted.map(async (incident) => {
        const detail = await reached.fetchDetail(held, workspace, incident)
        return {
          key: incident.key,
          title: incident.title,
          alerts: detail.raw.alerts,
          entities: detail.raw.entities,
        } as RawIncident
      }),
    )
  }

  /**
   * **A memo rather than a fresh object per render**, because `react-hooks`
   * reads a value built inline from refs as a ref read during render. The
   * members still touch `.current` only when one of them is called.
   */
  const writes: SentinelWrites = useMemo(
    () => ({
      connect: async (registration) => {
        provider.current = bundled ?? armSource(msalTokenProvider(registration))
        session.current = await provider.current.connect()
        return session.current.identity
      },

      sources: async () => {
        if (!session.current || !provider.current) {
          throw new Error('Sign in before listing workspaces.')
        }
        const answered = await provider.current.listSources(session.current)
        workspaces.current = answered.sources
        return answered.sources.map((one) => ({
          id: one.key,
          name: one.name,
          detail: one.group,
          subscription: one.group,
          incidents: 0,
        }))
      },

      incidents: async (sourceId, dials) => {
        const workspace = chosen(sourceId)
        if (!session.current || !provider.current || !workspace) {
          throw new Error('Pick a workspace first.')
        }
        const page = await provider.current.listIncidents(
          session.current,
          workspace,
          {
            severity: dials.severity,
            status: dials.status,
            title: dials.title,
            number: dials.number,
            // The dial carries the select's string; the provider takes hours.
            sinceHours: Number(dials.sinceHours) || 0,
          },
          null,
        )
        listing.current = new Map(page.incidents.map((one) => [one.key, one]))
        return page.incidents.map(forPicker)
      },

        preview: async (sourceId, incidentIds) => {
          const workspace = chosen(sourceId)
          if (!workspace) throw new Error('Pick a workspace first.')
          const payload = {
            provider: 'sentinel' as const,
            incidents: await detailed(workspace, incidentIds),
          }
          const result = await previewImport(caseId, payload)
          /**
           * **The body the review was drawn from, kept rather than re-read.**
           * A second `detailed()` is a second reading of the provider, so a
           * row it gained in between would be written having never been on
           * screen -- and the ids the analyst ticked were named against the
           * first reading. -> #382
           */
          reviewed.current = { for: keyOf(caseId, incidentIds), payload }
          return [...result.entities.map(forReview), ...result.timeline.map(timelineForReview)]
        },

        /**
         * **One act: the case and its rows land together or neither does.**
         * The two-act door wrote the case first, so an analyst who abandoned
         * the wizard left an empty case behind. -> #420
         */
        create: async (_sourceId, incidentIds, kase, approved) => {
          const held = reviewed.current
          if (held?.for !== keyOf(caseId, incidentIds)) {
            throw new Error('Review the rows before importing them.')
          }
          return startCaseFromIncident(
            held.payload,
            { approved: [...approved], edits: [] },
            kase,
          )
        },

        /**
         * **The rows the analyst left ticked, and no others.** The server
         * names every row it proposes and writes only the ones named back to
         * it; its candidate ids are built from the incident *and* the row's
         * own identity, so an incident key matches none of them -- approving
         * `incidentIds` approved nothing at all. -> #382
         */
        commit: async (_sourceId, incidentIds, approved) => {
          const held = reviewed.current
          if (held?.for !== keyOf(caseId, incidentIds)) {
            throw new Error('Review the rows before importing them.')
          }
          // Answered rather than swallowed: what the case actually gained is
          // the only number anything downstream may report.
          return commitImport(caseId, held.payload, { approved: [...approved], edits: [] })
        },
    }),
    [bundled, caseId],
  )

  // `connected` because the app can always attempt a live sign-in once it is
  // given coordinates; `preconfigured` only for the bundled fixture, which
  // needs none.
  return (
    <ImportSentinelScreen
      connected
      preconfigured={bundled !== null}
      writes={writes}
      startsACase={startsACase}
      asDialog={startsACase}
      {...(onCreated ? { onCreated } : {})}
      {...(onOpenChange ? { onOpenChange } : {})}
    />
  )
}
