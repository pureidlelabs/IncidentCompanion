import {
  EntityScopeTable,
  type EntityScopeTableProps,
} from '@/components/blocks/entity-scope-table'

/**
 * Cloud apps, scoped.
 *
 * Consented applications and who granted them. The name and the instance are one
 * identity: two tenants of one application are two rows, and the name alone
 * repeats.
 *
 * The entity family's one shape, opened on this kind: the scope row, the
 * search box and the filter bar are the same elements at the same pixels, and
 * only the table body differs. The search still spans every kind, so the scope
 * row answers which kind a string is in.
 */
export type CloudAppsScreenProps = Omit<EntityScopeTableProps, 'scope'>

export function CloudAppsScreen(props: CloudAppsScreenProps) {
  return <EntityScopeTable {...props} scope="cloud-apps" />
}
