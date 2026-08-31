/**
 * An alert becoming a timeline entry, and what it links to.
 *
 * **Carried across from the client rather than re-derived.** The severity
 * ladder, the tactic squashing and the four-step time fallback are decisions
 * with reasons behind them -- an alert with a severity Sentinel does not name
 * was mapped to a value no write could store, for as long as the feature
 * existed -- so they move whole. What changes is where they run: beside the
 * vocabularies they have to agree with, rather than a tier away from them.
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
 * cautious one.** `informational` rather than `low`: an import asserting an
 * unnamed severity is `low` is a claim nobody made. Narrower than `SEVERITY`
 * on purpose -- the vocabulary has `critical` and no detection produces it.
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
 *
 * A `Map` for the same reason `SEVERITY_MAP` is one, and here the guard that
 * fails is `if (tactic) break`.
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
 *
 * **`provenance` and `unreviewed` are not set here**, deliberately: they are
 * server-owned and the timeline's bulk door stamps them. A caller able to
 * assert `imported` could forge an evidentiary claim.
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
       * Generated, then start, then now. An entry with no time sorts nowhere
       * and reads as a defect; an approximate stamp is visible and correctable,
       * which is the trade the original made and it still holds.
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
 *
 * **Sentinel answers entities per incident, not per alert.** So an alert that
 * names none links to every entity in its incident -- exact for a one-alert
 * incident, over-linked otherwise, and the same compromise the arrangement
 * before this made. An alert that *does* name `entityIds` is narrowed to them,
 * which is the half that was never used.
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
