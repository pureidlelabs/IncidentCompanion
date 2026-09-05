import { useMemo, useRef, useState, type RefObject } from 'react'

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
import { COMMANDS, type Command } from '@/lib/shortcut-registry'

export interface CaseSearchBoxProps {
  /** The case the rows come from. */
  kase: Case | undefined
  /** What the field holds. Controlled, so a commit can clear it. */
  query: string
  onQueryChange: (query: string) => void
  /** The registry the Commands group is drawn from. */
  commands?: readonly Command[] | undefined
  /** The sections the results can jump to. */
  sections?: readonly SectionChoice[] | undefined
  /**
   * Runs when a row is committed, with the row's own id: `command:<id>`,
   * `section:<slug>` or `row:<slug>:<id>`. Omit to draw a list that commits
   * to nothing.
   */
  onAction?: ((id: string) => void) | undefined
  /** The text box itself, for the chord that focuses it. */
  inputRef?: RefObject<HTMLInputElement | null> | undefined
}

/**
 * The header's command bar: a field, with the palette's grouped rows beneath
 * it -- the commands, the sections, and the case's own hits.
 *
 * The same three sources `Mod+K` opens over, so the two surfaces answer a
 * query the same way. The list is non-modal, so the caret never leaves the
 * field.
 */
export function CaseSearchBox({
  kase,
  query,
  onQueryChange,
  commands = COMMANDS,
  sections = SECTIONS,
  onAction,
  inputRef,
}: CaseSearchBoxProps) {
  const anchor = useRef<HTMLDivElement>(null)
  const [dismissed, setDismissed] = useState(false)
  const groups = useMemo(
    () => asPaletteGroups(paletteRows(query, { commands, sections, kase })),
    [query, commands, sections, kase],
  )

  return (
    <div ref={anchor} className="w-full max-w-xs">
      <SearchField
        aria-label="Search this case or run a command"
        placeholder="Search or run a command"
        size="sm"
        value={query}
        onChange={(next) => {
          setDismissed(false)
          onQueryChange(next)
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
          emptyLabel="Nothing matches."
          {...(onAction === undefined ? {} : { onAction })}
        />
      </Popover>
    </div>
  )
}
