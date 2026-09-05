/**
 * An alert becoming a timeline entry, and what it links to.
 */
import { z } from 'zod'

import { SEVERITY, TACTIC } from '../../../domain/vocabularies.lists.js'
import type { RawIncident } from '../../../domain/incident-import.js'

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** ARM's alert, of which an import reads seven fields. */
const alertSchema = z.object({
  properties: z
    .object({
      systemAlertId: z.string().default(''),
      alertDisplayName: z.string().default(''),
      severity: z.string().default(''),
      tactics: z.array(z.string()).default([]),
      timeGenerated: z.string().default(''),
      startTimeUtc: z.string().default(''),
      endTimeUtc: z.string().default(''),
      /** ARM's own entity ids, when the alert names them. */
      entityIds: z.array(z.string()).default([]),
    })
    .partial(),
  id: z.string().default(''),
  name: z.string().default(''),
})

/**
 * **Sentinel's severities against this product's, and the default is the
 * cautious one.**
 *
 * A `Map` because the key is a vendor string, which `DEFAULT_SEVERITY` alone
 * does not cover.
 */
const SEVERITY_MAP: ReadonlyMap<string, (typeof SEVERITY)[number]> = new Map([
  ['high', 'high'],
  ['medium', 'medium'],
  ['low', 'low'],
  ['informational', 'informational'],
])
const DEFAULT_SEVERITY: (typeof SEVERITY)[number] = 'informational'

/**
 * The product's tactics, keyed by the spelling with spacing and case removed.
 */
const SQUASHED_TACTICS: ReadonlyMap<string, string> = new Map(
  TACTIC.map((tactic) => [tactic.replace(/[ _-]/g, '').toLowerCase(), tactic]),
)

export function normalizeTactic(value: string): string {
  return SQUASHED_TACTICS.get(value.trim().toLowerCase().replace(/[ _-]/g, '')) ?? ''
}

export interface MappedAlert {
  fields: Record<string, unknown>
  label: string
  identity: string
}

/**
 * One alert as a timeline entry, or `null` when it is not an alert.
 */
export function alertToTimeline(raw: unknown, incident: RawIncident): MappedAlert | null {
  const parsed = alertSchema.safeParse(raw)
  if (!parsed.success) return null
  const p = parsed.data.properties

  let tactic = ''
  for (const reported of p.tactics ?? []) {
    tactic = normalizeTactic(reported)
    if (tactic) break
  }

  const description = text(p.alertDisplayName) || incident.title || 'Sentinel alert'
  return {
    fields: {
      kind: 'event',
      description,
      /**
       * Generated, then start, then now.
       */
      time: text(p.timeGenerated) || text(p.startTimeUtc) || new Date().toISOString(),
      eventSource: 'siem alert',
      tactic,
      severity: SEVERITY_MAP.get(text(p.severity).toLowerCase()) ?? DEFAULT_SEVERITY,
      sourceTool: 'Microsoft Sentinel',
      /**
       * **Unset rather than asserted.** An import says nothing about how sure
       * the analyst is; `unreviewed`, which the server stamps, is what records
       * that the judgement is outstanding.
       */
      confidence: null,
    },
    label: description,
    identity: `alert${String.fromCharCode(31)}${text(p.systemAlertId) || parsed.data.name || description}`,
  }
}

/**
 * Which candidates an alert links to.
 */
export function entityRefsOf(
  raw: unknown,
  incident: RawIncident,
  byRef: ReadonlyMap<string, string>,
  candidates: ReadonlyMap<string, { collection: string }>,
): {
  system: string | null
  accounts: string[]
  networkIndicators: string[]
  malware: string[]
  cloudApps: string[]
} {
  const parsed = alertSchema.safeParse(raw)
  const named = parsed.success ? (parsed.data.properties.entityIds ?? []) : []
  const ids = named.length
    ? named.map((ref) => byRef.get(ref)).filter((id): id is string => id !== undefined)
    : [...new Set(byRef.values())]

  const of = (collection: string) =>
    ids.filter((id) => candidates.get(id)?.collection === collection)

  return {
    // One id, so the first host wins rather than the row being cloned per host.
    system: of('systems')[0] ?? null,
    accounts: of('accounts'),
    networkIndicators: of('network_indicators'),
    malware: of('malware'),
    cloudApps: of('cloud_apps'),
  }
}
