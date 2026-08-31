import { EntityScopeTable, type EntityScopeTableProps } from '@/components/blocks/entity-scope-table'

/**
 * Every entity in the case, and each kind on its own, as one screen.
 *
 * Unscoped: a generic five columns over every kind. The scope row, the search
 * box and the filter bar are the same elements at the same pixels here and on
 * the five slugs, and only the table body changes -- so the scope is a filter
 * rather than navigation, and pressing a kind stays on this page.
 *
 * The five slug screens hand the same block a `scope` of their own. Nothing is
 * drawn here that is not drawn there.
 */
export type EntitiesScreenProps = EntityScopeTableProps

export function EntitiesScreen(props: EntitiesScreenProps) {
  return <EntityScopeTable {...props} />
}
