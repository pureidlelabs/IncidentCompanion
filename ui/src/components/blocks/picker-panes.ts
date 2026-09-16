import {
  Activity,
  FileText,
  FolderOpen,
  Languages,
  LayoutTemplate,
  PlayCircle,
  Quote,
  ScrollText,
  ShieldCheck,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * Every pane of the picker, and the shape its rail draws them in.
 *
 * The sibling of `case-sections.ts`, and for the same reason: a rail written
 * out inside the one screen that draws it takes a new pane into no story and
 * no test. Identity only -- what a pane is
 * called and which glyph it carries -- because what it renders is the router's
 * business and differs between the gallery and the app.
 */
export type PickerPane =
  | 'new'
  | 'cases'
  | 'demos'
  | 'templates'
  | 'reports'
  | 'snippets'
  | 'accounts'
  | 'activity'
  | 'administration'
  | 'languages'
  | 'health'

/**
 * Every pane, as data.
 *
 * The union cannot be enumerated at runtime, and a test that cannot list the
 * panes cannot fail when a new one arrives with no body -- which is a defect
 * the picker shipped once already.
 */
export const PICKER_PANES: readonly PickerPane[] = [
  'new',
  'cases',
  'demos',
  'templates',
  'reports',
  'snippets',
  'accounts',
  'activity',
  'administration',
  'languages',
  'health',
]

export interface PickerDestination {
  pane: PickerPane
  /**
   * Whether every route behind it refuses an analyst. Per pane, not per group:
   * Report languages sits among three that are wholly `@AdminOnly` and its own
   * list is an open `@Get()`.
   */
  admin?: true
  label: string
  icon: LucideIcon
}

/**
 * The rail's destinations, in the three groups the picker uses.
 *
 * **About is not among them.** It answers a handful of unchanging facts and is
 * opened once, so it lives in the session menu rather than holding a row
 * beside the panes an analyst operates.
 *
 * **`new` is not among them either**: it is the rail's top card rather than a
 * row, which is why the pane list is longer than the rows.
 */
export interface PickerGroup {
  label: string
  rows: readonly PickerDestination[]
}

export const PICKER_GROUPS: readonly PickerGroup[] = [
  {
    label: 'Cases',
    rows: [
      { pane: 'cases', label: 'Your cases', icon: FolderOpen },
      { pane: 'demos', label: 'Demo cases', icon: PlayCircle },
    ],
  },
  {
    label: 'Library',
    rows: [
      { pane: 'templates', label: 'Case templates', icon: LayoutTemplate },
      { pane: 'reports', label: 'Reports', icon: FileText },
      { pane: 'snippets', label: 'Snippets', icon: Quote },
    ],
  },
  {
    label: 'System',
    rows: [
      { pane: 'accounts', admin: true, label: 'Accounts', icon: Users },
      { pane: 'activity', admin: true, label: 'Activity', icon: ScrollText },
      { pane: 'administration', admin: true, label: 'Administration', icon: ShieldCheck },
      { pane: 'languages', label: 'Report languages', icon: Languages },
      { pane: 'health', admin: true, label: 'Health', icon: Activity },
    ],
  },
]

/**
 * The rail this account is offered. A group left with no rows is dropped
 * rather than drawn as an empty heading.
 */
export function panesFor(account: { admin: boolean }): readonly PickerGroup[] {
  if (account.admin) return PICKER_GROUPS
  return PICKER_GROUPS.flatMap((group) => {
    const rows = group.rows.filter((row) => row.admin !== true)
    return rows.length > 0 ? [{ ...group, rows }] : []
  })
}
