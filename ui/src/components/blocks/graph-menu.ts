import type { RowMenuGroup } from '@/components/blocks/row-menu'

import type { IncidentNode } from './incident-graph'
import { KIND_LABEL } from './graph-kinds'

/**
 * What a right-click on the incident graph offers.
 *
 * **A pure function rather than a closure inside the section**, because the
 * decision is the whole feature and the section is unreachable from a unit
 * test: the canvas is Cytoscape over `<canvas>`, so jsdom renders no node to
 * right-click and the menu never opens. This is the seam a test can hold.
 *
 * **Additive only** - every item mirrors a visible control (`context-menu.tsx`
 * carries the reason). Two items an incident graph obviously wants are absent
 * for want of that door, and both are deliberate:
 *
 * - *Isolate what this touches* - hover already does it, and a hover is not a
 *   control an analyst can find.
 * - *Show the entries behind this event* - needs a Timeline scope that does not
 *   exist. `parseTimelineScope` reads the kill chain's `step`/`node` pair and
 *   nothing else, so the item would navigate to an unfiltered list.
 */
export interface GraphMenuContext {
  /** Group keys pulled apart, so the background can offer to re-fold them. */
  expanded: ReadonlySet<string>
  /** Kinds the chips have hidden, so the background can offer to show them. */
  hidden: ReadonlySet<string>
  /** Where an entity of each kind is edited. Absent for a kind with no screen
   *  of its own, which is what keeps evidence out of the menu. */
  screenFor: ReadonlyMap<string, { slug: string; title: string }>
  toggleGroup: (groupKey: string) => void
  hideKind: (kind: string) => void
  /** The entity's own screen. `undefined` leaves the item out. */
  hrefFor: (kind: string, entityId: string) => string | undefined
  refold: () => void
  showEveryKind: () => void
}

export function buildGraphMenu(
  node: IncidentNode | null,
  ctx: GraphMenuContext,
): RowMenuGroup[] {
  if (!node) {
    return [
      [
        ...(ctx.expanded.size > 0
          ? [{ id: 'refold', label: 'Re-fold groups', onSelect: ctx.refold }]
          : []),
        ...(ctx.hidden.size > 0
          ? [{ id: 'show-kinds', label: 'Show every kind', onSelect: ctx.showEveryKind }]
          : []),
      ],
    ]
  }

  // `entityId` is set only where the node stands for exactly one entity, so a
  // folded puck offers no screen - there is no single record to open.
  const screen = node.entityId ? ctx.screenFor.get(node.kind) : undefined
  const door = node.entityId ? ctx.hrefFor(node.kind, node.entityId) : undefined

  return [
    [
      ...(node.count > 1
        ? [{
            id: 'fold',
            label: node.unfolded
              ? 'Re-fold this group'
              : `Separate these ${String(node.count)}`,
            onSelect: () => {
              ctx.toggleGroup(node.groupKey)
            },
          }]
        : []),
      ...(screen && door !== undefined
        ? [{
            id: 'open',
            // The section's own title, so the item names the screen the rail
            // names rather than the graph's singular noun.
            label: `Open ${node.label} in ${screen.title}`,
            href: door,
          }]
        : []),
    ],
    // An event is what the entities hang off, so hiding its kind would strand
    // them - the chips decline it for the same reason. A junction is a routing
    // dot and stands for nothing.
    node.kind === 'event' || node.kind === 'junction'
      ? []
      : [{
          id: 'hide-kind',
          label: `Hide ${KIND_LABEL[node.kind] ?? node.kind}`,
          onSelect: () => {
            ctx.hideKind(node.kind)
          },
        }],
  ]
}
