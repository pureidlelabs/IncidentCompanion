import {
  EntityScopeTable,
  type EntityScopeTableProps,
} from '@/components/blocks/entity-scope-table'

/**
 * Network, scoped.
 *
 * Addresses, domains and URLs, with the host each was seen on. The value renders
 * verbatim: defanging is a report-output rule, and this table shows what is
 * stored.
 *
 * The entity family's one shape, opened on this kind: the scope row, the
 * search box and the filter bar are the same elements at the same pixels, and
 * only the table body differs. The search still spans every kind, so the scope
 * row answers which kind a string is in.
 */
export type NetworkScreenProps = Omit<EntityScopeTableProps, 'scope'>

export function NetworkScreen(props: NetworkScreenProps) {
  return <EntityScopeTable {...props} scope="network" />
}
