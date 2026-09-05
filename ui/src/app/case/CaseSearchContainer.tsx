import { useState, type RefObject } from 'react'
import { useNavigate } from 'react-router-dom'

import { useCase } from '@/api/case'
import { useCaseId } from '@/app/useCaseId'
import { commit } from '@/app/case/ChordLayerContainer'
import { CaseSearchBox } from '@/components/blocks/case-search-box'

export interface CaseSearchContainerProps {
  /** The header's box, for the chord that focuses it. */
  inputRef?: RefObject<HTMLInputElement | null> | undefined
  /** Runs a command by its registry id. The chord layer is what publishes it. */
  onRunCommand?: ((id: string) => void) | undefined
}

/**
 * The header's command bar, bound to the case it searches.
 *
 * The whole case, and only once something is typed: this is mounted on every
 * section, and an eager read is the whole document on each of them.
 */
export function CaseSearchContainer({ inputRef, onRunCommand }: CaseSearchContainerProps) {
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
        setQuery('')
        commit(
          rowId,
          caseId,
          (id) => {
            onRunCommand?.(id)
          },
          (to) => {
            void navigate(to)
          },
        )
      }}
    />
  )
}
