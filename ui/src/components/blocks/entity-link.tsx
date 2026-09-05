import { Link } from 'react-router-dom'

import { sectionPathFor } from '@/api/entityTargets'
import { EntityHoverCard, useEntityCardScope } from '@/components/blocks/entity-card'
import { MISSING_REFERENCE, type LinkedEntity } from '@/components/ui/entity-ref'
import { cn } from '@/lib/cn'

export { MISSING_REFERENCE }
export type { LinkedEntity }

export interface EntityLinkProps {
  entity: LinkedEntity
  className?: string
  /**
   * Whether the name itself is a link.
   */
  navigable?: boolean
}

/**
 * One linked entity: its name, its identity in the DOM, and its hover card.
 */
export function EntityLink({ entity, className, navigable = true }: EntityLinkProps) {
  const scope = useEntityCardScope()
  const missing = entity.name === ''
  const path = scope ? sectionPathFor(scope.caseId, entity.target, entity.id) : undefined
  const shared = {
    'data-slot': 'entity-link',
    'data-entity-target': entity.target,
    'data-entity-id': entity.id,
  }
  const text = missing ? MISSING_REFERENCE : entity.name

  const body =
    navigable && path ? (
      <Link
        {...shared}
        to={path}
        className={cn(
          'rounded-sm underline-offset-2 hover:underline',
          missing && 'italic',
          className,
        )}
      >
        {text}
      </Link>
    ) : (
      <span {...shared} className={cn(missing && 'italic', className)}>
        {text}
      </span>
    )

  return <EntityHoverCard entity={entity}>{body}</EntityHoverCard>
}
