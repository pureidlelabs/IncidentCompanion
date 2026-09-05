import { Plus } from 'lucide-react'

import type { BlockKindGroup } from '@/api/reportBlockKinds'
import { Button } from '@/components/ui/button'
import { Menu, MenuItem, MenuSectionGroup, MenuTrigger } from '@/components/ui/menu'
import { Popover } from '@/components/ui/popover'
import { reportBlockKinds } from '@/fixtures/reportBlockKinds'

/**
 * Adding a section, from the served vocabulary.
 */
export function ReportAddSectionMenu({
  groups = reportBlockKinds,
  onAddSection,
}: {
  groups?: readonly BlockKindGroup[]
  onAddSection: (kind: string) => void
}) {
  return (
    <MenuTrigger>
      <Button variant="outline" size="sm">
        <Plus aria-hidden />
        Add section
      </Button>
      {/*
        **Two columns, laid out by CSS rather than by wrapping the groups.**
        Six groups holding twenty-two kinds is a single column tall enough to
        run off the screen. `columns-2` flows the sections into two, and
        `break-inside-avoid` on each keeps a group whole -- splitting one across
        the fold would break the thing the headings are for.

        **The sections stay direct children of `Menu`.** React Aria builds its
        collection from the menu's own children, so a wrapper element around
        the groups renders a menu with no items in it.

        **Anchored on the trigger's right edge.** Add sits in a right-hand
        action row, and a panel growing rightwards runs off the viewport --
        measured in the app at 1440, where the second column was clipped
        mid-word with nothing to say there was more.
      */}
      <Popover placement="bottom end">
        <Menu
          aria-label="Kinds of section"
          className="w-max max-w-[min(36rem,90vw)] columns-2 gap-6 p-1"
          onAction={(key) => {
            onAddSection(String(key))
          }}
        >
          {groups.map((group) => (
            <MenuSectionGroup
              key={group.heading}
              title={group.heading}
              className="break-inside-avoid"
            >
              {group.kinds.map((kind) => (
                <MenuItem key={kind.kind} id={kind.kind}>
                  {kind.label}
                </MenuItem>
              ))}
            </MenuSectionGroup>
          ))}
        </Menu>
      </Popover>
    </MenuTrigger>
  )
}
