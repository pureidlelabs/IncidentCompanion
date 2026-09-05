import { useMemo, useRef } from 'react'

import { commitImport, previewImport, type RawIncident } from '@/api/incidentImport'
import { useCaseId } from '@/app/useCaseId'
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
export function ImportSentinelContainer() {
  const caseId = useCaseId()
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
  }): Candidate => ({
    id: one.id,
    incident: one.incident,
    collection: one.collection,
    label: one.label,
    verdict: one.verdict === 'existing' ? 'merge' : 'new',
    fields: Object.keys(one.fields).length,
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
          provider.current =
            bundled ?? armSource(msalTokenProvider(registration))
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
          const result = await previewImport(caseId, {
            provider: 'sentinel',
            incidents: await detailed(workspace, incidentIds),
          })
          return result.entities.map(forReview)
        },

        commit: async (sourceId, incidentIds) => {
          const workspace = chosen(sourceId)
          if (!workspace) throw new Error('Pick a workspace first.')
          await commitImport(
            caseId,
            { provider: 'sentinel', incidents: await detailed(workspace, incidentIds) },
            { approved: [...incidentIds], edits: [] },
          )
        },
    }),
    [bundled, caseId],
  )

  // `connected` because the app can always attempt a live sign-in once it is
  // given coordinates; `preconfigured` only for the bundled fixture, which
  // needs none.
  return (
    <ImportSentinelScreen connected preconfigured={bundled !== null} writes={writes} />
  )
}
