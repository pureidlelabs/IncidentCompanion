import { useMemo, useRef, useState, type RefObject } from 'react'
import { Autocomplete } from 'react-aria-components'

import type { Case } from '@/api/model'
import { PaletteResults } from '@/components/blocks/command-palette'
import {
  SECTIONS,
  asPaletteGroups,
  paletteRows,
  type SectionChoice,
} from '@/components/blocks/command-palette-dialog'
import { MENU_SURFACE, Popover } from '@/components/ui/popover'
import { SearchField } from '@/components/ui/search-field'

export interface CaseSearchBoxProps {
  /** The case the rows come from. */
  kase: Case | undefined
  /** What the field holds. Controlled, so a commit can clear it. */
  query: string
  onQueryChange: (query: string) => void
  /** The sections the results can jump to. */
  sections?: readonly SectionChoice[] | undefined
  /**
   * Runs when a row is committed, with the row's own id: `section:<slug>` or
   * `row:<slug>:<id>`. Omit to draw a list that commits to nothing.
   */
  onAction?: ((id: string) => void) | undefined
  /** The text box itself, for the chord that focuses it. */
  inputRef?: RefObject<HTMLInputElement | null> | undefined
}

/**
 * The header's search field, with the palette's grouped hits beneath it.
 *
 * No commands: `Mod+K` is where those live, and this is the box that used to
 * be a page. The list is non-modal, so the caret never leaves the field.
 */
export function CaseSearchBox({
  kase,
  query,
  onQueryChange,
  sections = SECTIONS,
  onAction,
  inputRef,
}: CaseSearchBoxProps) {
  const anchor = useRef<HTMLDivElement>(null)
  const [dismissed, setDismissed] = useState(false)
  const groups = useMemo(
    () => asPaletteGroups(paletteRows(query, { commands: [], sections, kase })),
    [query, sections, kase],
  )

  return (
    <div ref={anchor} className="w-full max-w-xs">
      {/* Virtual focus: the caret stays in the field and the list takes the
          arrows. No `filter` -- `paletteRows` already did. */}
      <Autocomplete
        inputValue={query}
        onInputChange={(next) => {
          setDismissed(false)
          onQueryChange(next)
        }}
      >
        <SearchField
          aria-label="Search this case"
          placeholder="Search this case"
          size="sm"
          // Escape empties the field; on one already empty there is nothing
          // left to empty, so it releases the caret rather than swallowing it.
          onKeyDown={(event) => {
            if (event.key === 'Escape' && query === '') {
              anchor.current?.querySelector('input')?.blur()
            }
          }}
          {...(inputRef === undefined ? {} : { inputRef })}
        />
        <Popover
          triggerRef={anchor}
          isOpen={query.trim() !== '' && !dismissed}
          onOpenChange={(open) => {
            if (!open) setDismissed(true)
          }}
          // Non-modal, or the overlay takes the keyboard off the field that
          // opened it and hides the rest of the case from assistive technology.
          isNonModal
          placement="bottom start"
          className={`max-h-96 w-(--trigger-width) min-w-80 ${MENU_SURFACE}`}
        >
          <PaletteResults
            groups={groups}
            emptyLabel="Nothing in this case matches."
            {...(onAction === undefined ? {} : { onAction })}
          />
        </Popover>
      </Autocomplete>
    </div>
  )
}
