import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { RailHeader } from '@/components/blocks/rail-header'
import { RailUser } from '@/components/blocks/rail-user'
import type { Person } from '@/components/blocks/presence'
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from '@/components/ui/sidebar'

/** What the rail is showing, and the menu that switches it. */
export interface RailHead {
  /** Drawn on the rail's own primary ground. Ignored when `mark` is given. */
  icon?: LucideIcon | undefined
  /** Drawn instead of `icon` - an avatar, a swatch. */
  mark?: ReactNode | undefined
  /** The case id, the install name. */
  name: string
  /** One line under it - a kind, a customer. */
  caption?: string | undefined
  /** Beside the name - what state the thing is in. */
  status?: string | undefined
  /** The switcher's rows. */
  menu: ReactNode
}

/** Who is signed in, at the foot of the rail. */
export interface RailSignedIn {
  /** `you` should be true, which is what tints the disc. */
  person: Person
  /** One line under the name - a role, an install. */
  caption?: string | undefined
  /** The session menu's rows. */
  menu: ReactNode
}

/**
 * The navigation rail, whole: what it is showing, where it goes, and who is
 * signed in.
 */
export function Rail({
  testId,
  label,
  head,
  user,
  children,
}: {
  /** The rail's own handle - two screens' rails are two things to find. */
  testId: string
  /** Names the rail and its rows for a screen reader. */
  label?: string | undefined
  /** Above the rows: the case, the install, and the menu that switches it. */
  head: RailHead
  /** Below the rows. Absent before anybody has signed in. */
  user?: RailSignedIn | undefined
  /** The rows. */
  children: ReactNode
}) {
  return (
    <Sidebar data-testid={testId} aria-label={label}>
      <SidebarHeader>
        <RailHeader
          {...(head.icon === undefined ? {} : { icon: head.icon })}
          {...(head.mark === undefined ? {} : { mark: head.mark })}
          name={head.name}
          {...(head.caption === undefined ? {} : { caption: head.caption })}
          {...(head.status === undefined ? {} : { status: head.status })}
        >
          {head.menu}
        </RailHeader>
      </SidebarHeader>
      <SidebarContent aria-label={label}>{children}</SidebarContent>
      {user !== undefined && (
        <SidebarFooter data-testid="rail-footer">
          <RailUser
            person={user.person}
            {...(user.caption === undefined ? {} : { caption: user.caption })}
          >
            {user.menu}
          </RailUser>
        </SidebarFooter>
      )}
    </Sidebar>
  )
}
