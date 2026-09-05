import { useState, type RefObject } from 'react'
import { useNavigate } from 'react-router-dom'

import { useCase } from '@/api/case'
import { useCaseId } from '@/app/useCaseId'
import { CaseSearchBox } from '@/components/blocks/case-search-box'

export interface CaseSearchContainerProps {
  /** The header's box, for the chord that focuses it. */
  inputRef?: RefObject<HTMLInputElement | null> | undefined
}

/**
 * The header's search box, bound to the case it searches.
 *
 * The whole case, and only once something is typed: this is mounted on every
 * section, and an eager read is the whole document on each of them.
 */
export function CaseSearchContainer({ inputRef }: CaseSearchContainerProps) {
  const caseId = useCaseId()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const kase = useCase(caseId, query.trim() !== '')

  return (
    <CaseSearchBox
      kase={kase.data}
      query={query}
      onQueryChange={setQuery}
      {...(inputRef === undefined ? {} : { inputRef })}
      onAction={(rowId) => {
        // `section:<slug>` and `row:<slug>:<id>` both land on the slug: there
        // is no per-entry address.
        const slug = rowId.split(':')[1]
        setQuery('')
        if (slug !== undefined) void navigate(`/cases/${encodeURIComponent(caseId)}/${slug}`)
      }}
    />
  )
}
