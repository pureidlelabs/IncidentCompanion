import { useCallback, useState, type RefObject } from 'react'

import { useCase } from '@/api/case'
import { useCaseId } from '@/app/useCaseId'
import { useCaseCommands } from '@/app/case/useCaseCommands'
import { CaseSearchBox } from '@/components/blocks/case-search-box'

export interface CaseSearchContainerProps {
  /** The header's box, for the chord that focuses it. */
  inputRef?: RefObject<HTMLInputElement | null> | undefined
  /** Open the shortcut sheet, which the shell owns. */
  onShortcuts?: (() => void) | undefined
}

/**
 * The case's omnibox, bound to the case it searches and to what it can run.
 */
export function CaseSearchContainer({ inputRef, onShortcuts }: CaseSearchContainerProps) {
  const caseId = useCaseId()
  const [query, setQuery] = useState('')
  const kase = useCase(caseId, query.trim() !== '')

  const focusSearch = useCallback(() => {
    inputRef?.current?.focus()
  }, [inputRef])
  const shortcuts = useCallback(() => {
    onShortcuts?.()
  }, [onShortcuts])

  const { commit } = useCaseCommands({
    caseId,
    onFocusSearch: focusSearch,
    onShortcuts: shortcuts,
  })

  return (
    <CaseSearchBox
      kase={kase.data}
      query={query}
      onQueryChange={setQuery}
      {...(inputRef === undefined ? {} : { inputRef })}
      onAction={(rowId) => {
        setQuery('')
        commit(rowId)
      }}
    />
  )
}
