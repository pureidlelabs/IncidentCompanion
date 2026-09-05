import { FileQuestion } from 'lucide-react'

import { elementFor } from './section-elements'
import { canonicalSlug } from '@/components/blocks/case-sections'
import { useSectionName } from '@/app/useCaseId'
import { EmptyState } from '@/components/blocks/empty-state'

/**
 * Resolves `:section` against the registry.
 */
export function SectionOutlet() {
  const slug = useSectionName()
  const element = elementFor(canonicalSlug(slug))

  if (element === undefined) {
    return (
      <EmptyState
        icon={FileQuestion}
        title="No such section"
        detail={`This case has no section called "${slug ?? ''}".`}
      />
    )
  }
  return element
}
