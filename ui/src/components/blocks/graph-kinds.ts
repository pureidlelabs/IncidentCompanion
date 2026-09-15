/**
 * The entity kinds the graph draws a chip for, in the order it offers them.
 *
 * The wire's target names rather than the analyst's; `KIND_LABEL` below is
 * what a chip reads. `graph-kinds.test.ts` holds this list to the reference
 * targets that register a scope, so a sixth kind gaining a screen cannot leave
 * the graph offering five.
 */
export const GRAPH_KINDS = ['system', 'account', 'network', 'malware', 'cloud_app'] as const

/** One kind of entity node, by the name a `ref.target` calls it. */
export type GraphKind = (typeof GRAPH_KINDS)[number]

export const KIND_LABEL: Record<string, string> = {
  system: 'Asset',
  account: 'Account',
  network: 'Indicator',
  malware: 'Malware',
  cloud_app: 'Cloud app',
  evidence: 'Evidence',
  // The analyst's word for it, matching the rail row. The key is the wire's
  // collection name because nothing references impact, so it has no screen key.
  impact: 'Impact',
}
