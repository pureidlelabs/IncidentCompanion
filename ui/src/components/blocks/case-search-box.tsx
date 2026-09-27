import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'

import type { Case } from '@/api/model'
import { PaletteResults } from '@/components/blocks/palette-results'
import {
  SECTIONS,
  asPaletteGroups,
  paletteRows,
  type SectionChoice,
} from '@/components/blocks/palette-rows'
import { COMMANDS, type Command } from '@/lib/shortcut-registry'
import { Autocomplete } from '@/components/ui/autocomplete'
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
  /** The commands the box can run. */
  commands?: readonly Command[] | undefined
  /**
   * Runs when a row is committed, with the row's own id: `section:<slug>` or
   * `row:<slug>:<id>`. Omit to draw a list that commits to nothing.
   */
  onAction?: ((id: string) => void) | undefined
  /** The text box itself, for the chord that focuses it. */
  inputRef?: RefObject<HTMLInputElement | null> | undefined
}

/** Marks the results surface, so an outside press can tell it from the page. */
const RESULTS_MARK = 'data-omnibox-results'

/**
 * The case's omnibox: commands, sections and the case's own rows under one
 * field.
 *
 * **One box, not a box and a dialog.** Both surfaces built their rows from the
 * same builder and drew them with the same list; the only difference was that
 * this one was handed no commands and the other opened over the screen. Two
 * places to type the same query is two answers to where a command lives.
 *
 * The list is non-modal, so the caret never leaves the field.
 */
export function CaseSearchBox({
  kase,
  query,
  onQueryChange,
  sections = SECTIONS,
  commands = COMMANDS,
  onAction,
  inputRef,
}: CaseSearchBoxProps) {
  const anchor = useRef<HTMLDivElement>(null)
  const [dismissed, setDismissed] = useState(false)
  const open = query.trim() !== '' && !dismissed

  /**
   * The outside press React Aria does not wire.
   *
   * A non-modal popover is given no interact-outside handler at all, and the
   * blur path cannot stand in: virtual focus keeps the caret in the field,
   * which is outside the surface, so focus is never within it to leave.
   *
   * On `click` rather than the press that starts it, which is what React Aria
   * does: closing on `pointerdown` takes the row out from under a press that
   * has not finished choosing it. Capturing, so a handler that stops
   * propagation cannot keep the list open over the case. -> #908
   */
  useEffect(() => {
    if (!open) return
    const closeOnOutside = (event: MouseEvent) => {
      // The primary button only. A secondary or middle press opens a menu or
      // a tab and is not the analyst leaving the list.
      if (event.button > 0) return
      const target = event.target
      if (!(target instanceof Element)) return
      if (anchor.current?.contains(target)) return
      if (target.closest(`[${RESULTS_MARK}]`)) return
      setDismissed(true)
    }
    document.addEventListener('click', closeOnOutside, true)
    return () => {
      document.removeEventListener('click', closeOnOutside, true)
    }
  }, [open])

  const groups = useMemo(
    () => asPaletteGroups(paletteRows(query, { commands, sections, kase })),
    [query, commands, sections, kase],
  )

  return (
    <div ref={anchor} className="w-full min-w-0 max-w-xs">
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
          aria-label="Search this case, or run a command"
          placeholder="Search, or run a command"
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
          {...{ [RESULTS_MARK]: '' }}
          triggerRef={anchor}
          isOpen={open}
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
