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
 * The sibling of `case-sections.ts`, and for the same reason: the picker's
 * rail was written out inside the one screen that drew it, so a pane added
 * there appeared in no story and no test. Identity only -- what a pane is
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
  label: string
  icon: LucideIcon
}

/**
 * The rail's destinations, in the three groups the picker has always used.
 *
 * **About is not among them.** It answers six unchanging facts and is opened
 * once, so it lives in the session menu rather than holding a row beside five
 * panes an analyst operates.
 *
 * **`new` is not among them either**: it is the rail's top card rather than a
 * row, which is why the pane list is longer than the rows.
 */
export const PICKER_GROUPS: readonly { label: string; rows: readonly PickerDestination[] }[] = [
  {
    label: 'CASES',
    rows: [
      { pane: 'cases', label: 'Your cases', icon: FolderOpen },
      { pane: 'demos', label: 'Demo cases', icon: PlayCircle },
    ],
  },
  {
    label: 'LIBRARY',
    rows: [
      { pane: 'templates', label: 'Case templates', icon: LayoutTemplate },
      { pane: 'reports', label: 'Reports', icon: FileText },
      { pane: 'snippets', label: 'Snippets', icon: Quote },
    ],
  },
  {
    label: 'SYSTEM',
    rows: [
      { pane: 'accounts', label: 'Accounts', icon: Users },
      { pane: 'activity', label: 'Activity', icon: ScrollText },
      { pane: 'administration', label: 'Administration', icon: ShieldCheck },
      { pane: 'languages', label: 'Report languages', icon: Languages },
      { pane: 'health', label: 'Health', icon: Activity },
    ],
  },
]

/** The group a pane sits in, so a story can open the rail where it belongs. */
export function groupHolding(pane: PickerPane) {
  return PICKER_GROUPS.find((group) => group.rows.some((row) => row.pane === pane))
}
