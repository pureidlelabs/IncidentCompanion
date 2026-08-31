import {
  EntityScopeTable,
  type EntityScopeTableProps,
} from '@/components/blocks/entity-scope-table'

/**
 * Accounts, scoped.
 *
 * Identities involved in the incident. `disabled` is an action already taken
 * rather than a judgement, which is why the shared State column reads it as
 * `disabled` / `active` and paints it from no tone map.
 *
 * The entity family's one shape, opened on this kind: the scope row, the
 * search box and the filter bar are the same elements at the same pixels, and
 * only the table body differs. The search still spans every kind, so the scope
 * row answers which kind a string is in.
 */
export type AccountsScreenProps = Omit<EntityScopeTableProps, 'scope'>

export function AccountsScreen(props: AccountsScreenProps) {
  return <EntityScopeTable {...props} scope="accounts" />
}
