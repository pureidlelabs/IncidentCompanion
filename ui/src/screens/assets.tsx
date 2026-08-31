import {
  EntityScopeTable,
  type EntityScopeTableProps,
} from '@/components/blocks/entity-scope-table'

/**
 * Assets, scoped.
 *
 * Hosts, servers, mailboxes and appliances this incident touched, on the columns
 * the systems form declares: hostname, type, verdict, zone, analysis status and
 * whether the host is isolated.
 *
 * The entity family's one shape, opened on this kind: the scope row, the
 * search box and the filter bar are the same elements at the same pixels, and
 * only the table body differs. The search still spans every kind, so the scope
 * row answers which kind a string is in.
 */
export type AssetsScreenProps = Omit<EntityScopeTableProps, 'scope'>

export function AssetsScreen(props: AssetsScreenProps) {
  return <EntityScopeTable {...props} scope="assets" />
}
