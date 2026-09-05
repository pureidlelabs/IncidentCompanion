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
