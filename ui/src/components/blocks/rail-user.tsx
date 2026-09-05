import { ChevronsUpDown } from 'lucide-react'
import type { ReactNode } from 'react'

import { Menu, MenuTrigger } from '@/components/ui/menu'
import { PersonAvatar, type Person } from '@/components/blocks/presence'
import { SidebarHeaderMenuButton } from '@/components/ui/sidebar'

/**
 * The signed-in analyst at the foot of the rail, and the menu they open.
 */
export function RailUser({
  person,
  caption,
  children,
}: {
  /** The signed-in analyst. `you` should be true, which is what tints the disc. */
  person: Person
  /** One line under the name - a role, an install. */
  caption?: string | undefined
  /** The menu's rows. */
  children: ReactNode
}) {
  return (
    <MenuTrigger>
      <SidebarHeaderMenuButton
        // Square, because the rail draws every other mark as one: a disc here
        // is the single round thing in the column and reads as a different
        // kind of object rather than as the analyst.
        mark={<PersonAvatar person={person} shape="square" className="size-6 text-[10px]" />}
        label={person.name}
        {...(caption === undefined ? {} : { caption })}
        tooltip={person.name}
        aria-label={`${person.name}. Session menu`}
        data-testid="rail-user"
      />
      {/* The kit's `Menu` positions through its own popover; the rail's
          footer sits at the bottom, so the menu opens upward on its own. */}
      <Menu>{children}</Menu>
    </MenuTrigger>
  )
}

/** The chevron a caller can put in its own trigger, if it builds one by hand. */
export { ChevronsUpDown as RailUserGlyph }
