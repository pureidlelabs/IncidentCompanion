import { Activity, FolderOpen, Info, Upload } from 'lucide-react'
import type { ReactNode } from 'react'

import { AppShell } from '@/components/blocks/app-shell'
import { AsyncBoundary } from '@/components/ui/async-boundary'
import { PICKER_GROUPS, type PickerPane } from '@/components/blocks/picker-panes'
import { RailGroup, RailRow } from '@/components/blocks/rail-nav'
import { Rail } from '@/components/blocks/rail'
import { Button } from '@/components/ui/button'
import { MenuItem, MenuLabel, MenuSectionGroup, MenuSeparator } from '@/components/ui/menu'
import { Mark } from '@/components/ui/mark'
import { SidebarMenu } from '@/components/ui/sidebar'

/**
 * The picker, framed: its rail, its header bar, and the pane in it.
 */
export interface PickerFrameProps {
  /** Which row is lit. */
  pane: PickerPane
  /** Where a row goes. Without it the rows are inert, which a story wants. */
  onPane?: ((pane: PickerPane) => void) | undefined
  /** Opens the archive reader. Inert without one, as the rows are. */
  onImportArchive?: (() => void) | undefined
  /** The user footer's menu rows. The story supplies its own. */
  userMenu: ReactNode
  /** Who is signed in, at the rail's foot. */
  analyst: string
  /** Opens the About door. The dialog is the route's, not this frame's. */
  onAbout: () => void
  /**
   * What went wrong reading this pane, if anything.
   */
  problem?: string | Error | undefined
  /** Asked again when *Try again* is pressed. Without one, no retry is offered. */
  onRetry?: (() => void) | undefined
  /**
   * The pane's data is still being read.
   */
  busy?: boolean
  children: ReactNode
}

/**
 * What the rail's top card opens.
 */
const productMenuRows = (onAbout: () => void, onHealth: () => void) => (
  <>
    <MenuLabel>IncidentCompanion</MenuLabel>
    <MenuSeparator />
    <MenuSectionGroup>
      <MenuItem id="about" onAction={onAbout}>
        <Info />
        About this install
      </MenuItem>
      <MenuItem id="health" onAction={onHealth}>
        <Activity />
        Health
      </MenuItem>
    </MenuSectionGroup>
  </>
)

export function PickerFrame({
  pane,
  onPane,
  onImportArchive,
  userMenu,
  analyst,
  problem,
  busy = false,
  onRetry,
  onAbout,
  children,
}: PickerFrameProps) {
  const go = (next: PickerPane) => () => {
    onPane?.(next)
  }


  return (
    <AppShell
      collapsedKey="sb-picker-rail"
      triggerTestId="picker-rail-collapse"
      rail={
        <Rail
          testId="picker-rail"
          label="Picker"
          head={{
            mark: <Mark className="size-5" />,
            name: 'IncidentCompanion',
            caption: 'Local investigation workspace',
            menu: productMenuRows(onAbout, go('health')),
          }}
          user={{
            person: { name: analyst, you: true },
            caption: 'Signed in on this install',
            menu: userMenu,
          }}
        >
          <RailGroup label={null} storageKey="picker-start" holdsCurrent testId="picker-start">
          <SidebarMenu>
            <RailRow
              icon={FolderOpen}
              label="New case"
              active={pane === 'new'}
              testId="picker-row-new"
              onSelect={go('new')}
            />
            {/* A door, not a destination: it passes no `active`, so it can
                never be marked current while its dialog sits over another
                pane. Reading an archive back is the server's, and there is no
                pane here for it to land on. */}
            <RailRow
              icon={Upload}
              label="Import archive"
              onSelect={onImportArchive ?? (() => undefined)}
            />
          </SidebarMenu>
          </RailGroup>

          {PICKER_GROUPS.map((group) => (
            <RailGroup
              key={group.label}
              label={group.label}
              storageKey={`sb-picker-group-${group.label}`}
              testId="picker-rail-group-label"
              holdsCurrent={group.rows.some((one) => one.pane === pane)}
            >
              <SidebarMenu>
                {group.rows.map((entry) => (
                  <RailRow
                    key={entry.pane}
                    icon={entry.icon}
                    label={entry.label}
                    active={pane === entry.pane}
                    testId={`picker-row-${entry.pane}`}
                    onSelect={go(entry.pane)}
                  />
                ))}
              </SidebarMenu>
            </RailGroup>
          ))}
        </Rail>
      }
      headerEnd={
        <Button variant="default" size="sm" onPress={go('new')}>
          New case
        </Button>
      }
    >
      <AsyncBoundary
        isPending={busy}
        isError={problem !== undefined}
        error={typeof problem === 'string' ? new Error(problem) : problem}
        {...(onRetry ? { refetch: onRetry } : {})}
      >
        {children}
      </AsyncBoundary>
    </AppShell>
  )
}
