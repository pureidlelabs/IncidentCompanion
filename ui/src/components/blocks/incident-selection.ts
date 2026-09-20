import { severityLabel } from '@/components/ui/severity-tones'

import { KIND_LABEL } from './graph-kinds'
import type { IncidentNode } from './incident-graph'

/**
 * The line above a selected node: what it is, and what else is true of it.
 *
 * **A function rather than five expressions in the panel**, because this is
 * the one decision about that panel a test can hold. Cytoscape paints to a
 * `<canvas>`, and the panel opens off an anchor set by a real click on it, so
 * a story can set `picked` and still never see the panel at all.
 *
 * **A rateable node always names its severity; anything else only names one it
 * has.** The timeline draws `unset` for an unrated event, so a summary that
 * omitted the segment described one entry two ways -- and omitted it on
 * exactly the event still waiting to be rated. An action is not rateable, and
 * `unset` about one would be a claim its record cannot carry. -> #983
 */
export function selectionSummary(node: IncidentNode): string {
  const parts: string[] = [node.kind === 'event' ? 'Event' : (KIND_LABEL[node.kind] ?? node.kind)]
  if (node.rateable) parts.push(severityLabel(node.severity))
  else if (node.severity) parts.push(node.severity)
  if (node.count > 1) parts.push(`${String(node.count)} together`)
  if (node.bridge) parts.push(`in ${String(node.spans)} kinds of event`)
  if (node.entry) parts.push('entry point')
  return parts.join(' \u00b7 ')
}
