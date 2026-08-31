import { useState, type ReactNode } from 'react'

import { AboutContainer } from '@/app/AboutContainer'
import { CheatSheetDialog } from '@/components/blocks/cheat-sheet'
import { AccountContainer } from '@/app/picker/AccountContainer'
import { NewCaseContainer } from '@/app/picker/NewCaseContainer'
import { sessionRows } from '@/components/blocks/session-menu'
import { useSession } from '@/api/useSession'
import { useGround } from '@/lib/useGround'

import {
  AccountsPaneView,
  ArchiveDoor,
  ActivityPaneView,
  AdministrationPaneView,
  CasesPaneView,
  DemosPaneView,
  HealthPaneView,
  LanguagesPaneView,
  NewPaneView,
  ReportsPaneView,
  SnippetsPaneView,
  TemplatesPaneView,
} from './panes'

import type { PickerPane } from '@/components/blocks/picker-panes'

/**
 * Every picker pane, and the three doors the rail and the New pane open.
 *
 * **The pane is state rather than a route**, which is what the picker does:
 * only `/account` is addressable, and the rail moves between panes without
 * touching the URL.
 *
 * The map is total, so a pane added to `PickerPane` is a compile error here
 * rather than a screen that silently falls back to something else.
 */
const CONVERTED: Readonly<
  Record<
    PickerPane,
    (props: {
      onPane: (pane: PickerPane) => void
      onImportArchive?: (() => void) | undefined
      userMenu?: ReactNode | undefined
      onAbout: () => void
      onBlank?: (() => void) | undefined
      onFromImporter?: (() => void) | undefined
    }) => React.ReactElement
  >
> = {
  new: NewPaneView,
  cases: CasesPaneView,
  demos: DemosPaneView,
  templates: TemplatesPaneView,
  reports: ReportsPaneView,
  snippets: SnippetsPaneView,
  accounts: AccountsPaneView,
  activity: ActivityPaneView,
  administration: AdministrationPaneView,
  languages: LanguagesPaneView,
  health: HealthPaneView,
}

export function PickerRoute() {
  const [pane, setPane] = useState<PickerPane>('cases')
  const session = useSession()
  const { theme, setTheme } = useGround()
  const [account, setAccount] = useState(false)
  const [about, setAbout] = useState(false)
  const [sheet, setSheet] = useState(false)
  // Held here rather than in a pane: the rail offers this door from every one
  // of them, and a dialog inside a pane goes when the pane does.
  const [reading, setReading] = useState(false)
  const [door, setDoor] = useState<'blank' | 'importer' | null>(null)

  const Pane = CONVERTED[pane]
  return (
    <>
      <Pane
        onPane={setPane}
        userMenu={sessionRows(
          session?.username ?? '',
          theme,
          setTheme,
          () => {
            setAccount(true)
          },
          () => {
            setSheet(true)
          },
          () => {
            setAbout(true)
          },
        )}
        onAbout={() => {
          setAbout(true)
        }}
        onImportArchive={() => {
          setReading(true)
        }}
        onBlank={() => {
          setDoor('blank')
        }}
        onFromImporter={() => {
          setDoor('importer')
        }}
      />
      <ArchiveDoor isOpen={reading} onOpenChange={setReading} />
      <AccountContainer isOpen={account} onOpenChange={setAccount} />
      <AboutContainer isOpen={about} onOpenChange={setAbout} />
      <CheatSheetDialog isOpen={sheet} onOpenChange={setSheet} />
      {door !== null && (
        <NewCaseContainer
          door={door}
          onClose={() => {
            setDoor(null)
          }}
        />
      )}
    </>
  )
}
