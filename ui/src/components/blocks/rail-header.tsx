import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { Menu, MenuTrigger } from '@/components/ui/menu'
import { SidebarHeaderMenuButton } from '@/components/ui/sidebar'

/**
 * What the rail is showing, at its head, and the menu that switches it.
 *
 * The case in the workspace, the install in the picker. Two lines: the thing's
 * name with its state beside it, and one line of what it is.
 *
 * - Folded, the row is the glyph alone and the tooltip carries the name.
 * - The menu's rows are the caller's: this block owns the row and the
 *   affordance, not what switching does.
 * - `status` rides the name line rather than the header bar, so it is read as
 *   part of what the rail is showing.
 */
export function RailHeader({
  icon: Icon,
  mark,
  name,
  caption,
  status,
  children,
}: {
  /** Drawn on the rail's own primary ground. Ignored when `mark` is given. */
  icon?: LucideIcon | undefined
  /** Drawn instead of `icon` - an avatar, a swatch. */
  mark?: ReactNode | undefined
  /** The case id, the install name. */
  name: string
  /** One line under it - a kind, a customer. */
  caption?: string | undefined
  /** Beside the name - `Open`, `Closed`. Absent draws no badge at all. */
  status?: string | undefined
  /** The menu's rows. */
  children: ReactNode
}) {
  return (
    <MenuTrigger>
      <SidebarHeaderMenuButton
        {...(mark === undefined
          ? Icon === undefined
            ? {}
            : { mark: <Icon aria-hidden className="size-4" /> }
          : { mark })}
        label={
          status === undefined ? (
            name
          ) : (
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{name}</span>
              {/* `outlined`, not `soft`. The rail stands on `bg-sidebar` and
                  `soft` is the page's `bg-secondary`, which on the light
                  ground is the sidebar's own colour - the chip disappeared and
                  the word read as loose text beside the name. An edge reads on
                  either ground, and receding is the right job for a state
                  sitting next to the thing it describes. */}
              <Badge
                variant="outlined"
                size="xs"
                className="shrink-0"
                data-testid="rail-header-status"
              >
                {status}
              </Badge>
            </span>
          )
        }
        {...(caption === undefined ? {} : { caption })}
        tooltip={status === undefined ? name : `${name} \u00b7 ${status}`}
        // The state is in the accessible name too: folded, the badge is not
        // drawn at all, and unfolded a screen reader reads the button's label
        // rather than the two spans inside it.
        aria-label={status === undefined ? `${name}. Switch` : `${name}, ${status}. Switch`}
        data-testid="rail-header"
      />
      <Menu>{children}</Menu>
    </MenuTrigger>
  )
}
