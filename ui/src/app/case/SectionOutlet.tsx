import { FileQuestion } from 'lucide-react'

import { elementFor } from './section-elements'
import { canonicalSlug } from '@/components/blocks/case-sections'
import { useSectionName } from '@/app/useCaseId'
import { EmptyState } from '@/components/blocks/empty-state'

/**
 * Resolves `:section` against the registry.
 *
 * **Identity and element are two modules, and this is why.** A map that
 * answers what a slug means by building every section's JSX at module scope
 * drags the whole tier in behind one lookup. `case-sections` answers identity
 * with no component anywhere in it, and `section-elements` answers what to
 * draw.
 *
 * The alias is resolved first, so a slug arriving under its old spelling gets
 * the section it addresses rather than falling through to the empty state.
 *
 * A slug with no section renders an empty state rather than throwing or
 * redirecting: a stale bookmark or a typed URL is the analyst's mistake to see,
 * and a silent redirect to the overview would look like the link worked.
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
