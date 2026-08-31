import { ChevronsUpDown } from 'lucide-react'
import type { ReactNode } from 'react'

import { Menu, MenuTrigger } from '@/components/ui/menu'
import { PersonAvatar, type Person } from '@/components/blocks/presence'
import { SidebarHeaderMenuButton } from '@/components/ui/sidebar'

/**
 * The signed-in analyst at the foot of the rail, and the menu they open.
 *
 * - The disc is the analyst's own, in the colour their colleagues see.
 * - Folded, the row is the disc alone and the tooltip carries the name.
 * - The menu's contents are the caller's: this block owns the row, the disc and
 *   the affordance, not what signing out does.
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
        mark={<PersonAvatar person={person} className="size-6 text-[10px]" />}
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
