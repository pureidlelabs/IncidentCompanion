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
   * Whether the name itself is a link. `false` where the surrounding chrome
   * already owns the click - a cell whose whole box is a button, where an
   * anchor inside a button is invalid markup.
   */
  navigable?: boolean
}

/**
 * One linked entity: its name, its identity in the DOM, and its hover card.
 *
 * - Renders the name resolved at render time, never a stored copy.
 * - Carries `data-slot`, `data-entity-target` and `data-entity-id`, which the
 *   graph cross-highlight and the tests attach to.
 * - Navigates to the target's section with the id as `?highlight=`, which
 *   `DataTable` reads back to scroll to the row and flash it.
 * - Wraps itself in the kit's `EntityHoverCard`; with no `EntityCardProvider`
 *   above it the card never opens and the link still navigates.
 * - Outside an `EntityCardProvider` there is no path, so it renders a span.
 * - A dangling id renders `(missing reference)` in italic and still navigates.
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
