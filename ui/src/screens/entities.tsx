import { EntityScopeTable, type EntityScopeTableProps } from '@/components/blocks/entity-scope-table'

/**
 * Every entity in the case, and each kind on its own, as one screen.
 */
export type EntitiesScreenProps = EntityScopeTableProps

export function EntitiesScreen(props: EntitiesScreenProps) {
  return <EntityScopeTable {...props} />
}
