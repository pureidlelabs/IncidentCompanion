import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

import { useCases } from '@/api/case'
import { useImportCase } from '@/api/useImportCase'
import { useAccounts, useAccountWrite } from '@/api/accounts'
import { useInstallActivity, type AuditLine } from '@/api/installActivity'
import { useLanguages } from '@/api/languages'
import { useLibrary } from '@/api/library'
import { useDemos } from '@/api/useDemos'
import { useSession } from '@/api/useSession'
import { useBackendHealth } from '@/api/useBackendHealth'
import { useActivity, useResources } from '@/api/useInstallHealth'
import { reportImportedCase, reportWriteFailure } from '@/components/blocks/notify'
import {
  connectionGauge,
  figureRows,
  gaugeRows,
  servingRows,
  tableRows,
  uptimeLine,
} from '@/app/picker/health'
import { splitWritten } from '@/api/written'
import { PickerAccountsScreen } from '@/screens/picker-accounts'
import { PickerActivityScreen } from '@/screens/picker-activity'
import { PickerAdministrationScreen } from '@/screens/picker-administration'
import { usePolicy, useSetPolicy } from '@/api/policy'
import { IDLE_KEY, LIFETIME_KEY, sessionBounds } from './session-bounds'
import { PickerCasesScreen } from '@/screens/picker-cases'
import { PickerDemosScreen } from '@/screens/picker-demos'
import { PickerHealthScreen } from '@/screens/picker-health'
import { PickerLanguagesScreen } from '@/screens/picker-languages'
import { ImportCaseScreen } from '@/screens/import-case'
import { PickerNewScreen } from '@/screens/picker-new'
import { PickerReportsScreen } from '@/screens/picker-reports'
import { PickerSnippetsScreen } from '@/screens/picker-snippets'
import { PickerTemplatesScreen } from '@/screens/picker-templates'

import { ENTRY_SLUG } from '@/components/blocks/case-sections'

import type { PickerPane } from '@/components/blocks/picker-panes'
import type { AuditRow } from '@/components/blocks/activity-log'
import type { AccountRow } from '@/components/blocks/account-table'
import type { LibraryRow } from '@/components/blocks/library-collection'
import type { LanguageRow } from '@/components/blocks/picker-rows'

/**
 * One container per picker pane, bound to what each reads.
 *
 * **One file, because each component renders only the screen it imports** --
 * which is what `a-container-draws-nothing.rule.test.ts` asks. A file each,
 * differing by one hook and one element, would be that many places to keep in
 * step.
 *
 * Each takes `onPane` and nothing else: the pane in view is the picker route's
 * state, and a screen sends a rail press back up rather than navigating.
 */

interface PaneProps {
  onPane: (pane: PickerPane) => void
  /** Opens the archive reader from the rail. */
  onImportArchive?: (() => void) | undefined
  /** The user footer's menu rows, built by the route. */
  userMenu?: ReactNode | undefined
  /** Opens the About door the route owns. */
  onAbout: () => void
  /** Opens the blank-case form. Only the New pane offers it. */
  onBlank?: (() => void) | undefined
  /** The same form, landing in the importer once the case exists. */
  onFromImporter?: (() => void) | undefined
}

/**
 * The rail's archive door, bound to the call that reads one back.
 *
 * Its own component because it sits above the panes: the pane in view is the
 * route's state, and a dialog held inside one would go with the pane behind
 * it.
 */
export function ArchiveDoor({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const importCase = useImportCase()

  return (
    <ImportCaseScreen
      isOpen={isOpen}
      onOpenChange={(open) => {
        onOpenChange(open)
        if (!open) importCase.reset()
      }}
      busy={importCase.isPending}
      {...(importCase.error === null ? {} : { problem: importCase.error.message })}
      writes={{
        start: (archive) => {
          importCase.mutate(archive, {
            onSuccess: (imported) => {
              onOpenChange(false)
              reportImportedCase(imported)
              void navigate(`/cases/${encodeURIComponent(imported.id)}/${ENTRY_SLUG}`)
            },
          })
        },
      }}
    />
  )
}

/**
 * Who is signed in, for the rail's foot. Undefined until the session lands.
 *
 * `username`, because the foot draws a person and `userId` is an opaque id.
 */
function useAnalyst(): string | undefined {
  return useSession()?.username
}

export function CasesPaneView({ onPane, onImportArchive, userMenu, onAbout }: PaneProps) {
  const cases = useCases()
  const analyst = useAnalyst()
  return (
    <PickerCasesScreen
      cases={cases.data ?? []}
      busy={cases.isPending}
      analyst={analyst ?? ''}
      {...(cases.error === null ? {} : { problem: cases.error })}
      onPane={onPane}
      {...(onImportArchive ? { onImportArchive } : {})}
      userMenu={userMenu}
      onAbout={onAbout}
      onRetry={() => void cases.refetch()}
    />
  )
}

export function NewPaneView({ onPane, onImportArchive, userMenu, onAbout, onBlank, onFromImporter }: PaneProps) {
  const analyst = useAnalyst()
  return (
    <PickerNewScreen
      analyst={analyst ?? ''}
      onPane={onPane}
      {...(onImportArchive ? { onImportArchive } : {})}
      userMenu={userMenu}
      onAbout={onAbout}
      {...(onBlank ? { onBlank } : {})}
      {...(onFromImporter ? { onImport: onFromImporter } : {})}
    />
  )
}

export function DemosPaneView({ onPane, onImportArchive, userMenu, onAbout }: PaneProps) {
  const demos = useDemos()
  const analyst = useAnalyst()
  return (
    <PickerDemosScreen
      // The demos are seeded at server start, so a card is a link into the
      // case that already exists rather than a call that builds one.
      href={(demo) => `/cases/${encodeURIComponent(demo.id)}/${ENTRY_SLUG}`}
      demos={demos.data ?? []}
      busy={demos.isPending}
      analyst={analyst ?? ''}
      {...(demos.error === null ? {} : { problem: demos.error })}
      onPane={onPane}
      {...(onImportArchive ? { onImportArchive } : {})}
      userMenu={userMenu}
      onAbout={onAbout}
      onRetry={() => void demos.refetch()}
    />
  )
}

/**
 * An account as the table wants it.
 *
 * **Two types share the name `AccountRow`** -- `api/accounts` sends one with
 * no key, `account-table` draws one that needs an `id`. The username is
 * the key the server addresses an account by, so it is the id here.
 */
function accountRows(rows: readonly { username: string }[] | undefined): AccountRow[] {
  return (rows ?? []).map((row) => ({ ...row, id: row.username })) as AccountRow[]
}

/**
 * A library listing as the collection block wants it. Same shape as above:
 * `LibraryEntry` carries no key and `LibraryRow` needs one, and the name is
 * what the server addresses the file by.
 */
function libraryRows(entries: readonly { name: string }[] | undefined): LibraryRow[] {
  return (entries ?? []).map((entry) => ({ ...entry, id: entry.name })) as LibraryRow[]
}

export function TemplatesPaneView({ onPane, onImportArchive, userMenu, onAbout }: PaneProps) {
  const library = useLibrary('templates')
  const analyst = useAnalyst()
  return (
    <PickerTemplatesScreen
      entries={libraryRows(library.data?.entries)}
      busy={library.isPending}
      analyst={analyst ?? ''}
      {...(library.error === null ? {} : { problem: library.error })}
      onPane={onPane}
      {...(onImportArchive ? { onImportArchive } : {})}
      userMenu={userMenu}
      onAbout={onAbout}
      onRetry={() => void library.refetch()}
    />
  )
}

export function ReportsPaneView({ onPane, onImportArchive, userMenu, onAbout }: PaneProps) {
  const library = useLibrary('report-layouts')
  const analyst = useAnalyst()
  return (
    <PickerReportsScreen
      entries={libraryRows(library.data?.entries)}
      busy={library.isPending}
      analyst={analyst ?? ''}
      {...(library.error === null ? {} : { problem: library.error })}
      onPane={onPane}
      {...(onImportArchive ? { onImportArchive } : {})}
      userMenu={userMenu}
      onAbout={onAbout}
      onRetry={() => void library.refetch()}
    />
  )
}

export function SnippetsPaneView({ onPane, onImportArchive, userMenu, onAbout }: PaneProps) {
  const library = useLibrary('report-snippets')
  const analyst = useAnalyst()
  return (
    <PickerSnippetsScreen
      entries={libraryRows(library.data?.entries)}
      busy={library.isPending}
      analyst={analyst ?? ''}
      {...(library.error === null ? {} : { problem: library.error })}
      onPane={onPane}
      {...(onImportArchive ? { onImportArchive } : {})}
      userMenu={userMenu}
      onAbout={onAbout}
      onRetry={() => void library.refetch()}
    />
  )
}

export function AccountsPaneView({ onPane, onImportArchive, userMenu, onAbout }: PaneProps) {
  const accounts = useAccounts()
  const analyst = useAnalyst()
  // `''` is the create path: `useAccountWrite` appends to `/accounts`.
  const create = useAccountWrite('')
  const refused = create.data?.ok === false ? splitWritten(create.data).problem : undefined
  return (
    <PickerAccountsScreen
      roles={accounts.data?.roles ?? []}
      defaultRole={accounts.data?.defaultRole ?? ''}
      creating={create.isPending}
      {...(refused === undefined ? {} : { refusal: refused })}
      onCreate={(account) => {
        create.mutate({ ...account }, {
          onSuccess: (written) => {
            if (written.ok) accounts.refetch().catch(() => undefined)
          },
        })
      }}
      accounts={accountRows(accounts.data?.accounts)}
      busy={accounts.isPending}
      analyst={analyst ?? ''}
      {...(accounts.error === null ? {} : { problem: accounts.error })}
      onPane={onPane}
      {...(onImportArchive ? { onImportArchive } : {})}
      userMenu={userMenu}
      onAbout={onAbout}
      onRetry={() => void accounts.refetch()}
    />
  )
}

export function AdministrationPaneView({ onPane, onImportArchive, userMenu, onAbout }: PaneProps) {
  const accounts = useAccounts()
  const analyst = useAnalyst()
  const policy = usePolicy()
  const setPolicy = useSetPolicy()
  const windows = sessionBounds(
    {
      idle: policy.data?.settings[IDLE_KEY],
      lifetime: policy.data?.settings[LIFETIME_KEY],
    },
    (key, value) => {
      // **The refusal has to be said.** The control is drawn from what the
      // server serves, so a write that fails leaves it showing the old window
      // with nothing to tell the administrator their change did not take.
      setPolicy.mutate(
        { key, value },
        { onError: (error) => { reportWriteFailure(error, 'the sign-in window') } },
      )
    },
  )
  return (
    <PickerAdministrationScreen
      signIn={windows}
      accounts={accountRows(accounts.data?.accounts)}
      busy={accounts.isPending}
      analyst={analyst ?? ''}
      {...(accounts.error === null ? {} : { problem: accounts.error })}
      onPane={onPane}
      {...(onImportArchive ? { onImportArchive } : {})}
      userMenu={userMenu}
      onAbout={onAbout}
      onRetry={() => void accounts.refetch()}
    />
  )
}

export function LanguagesPaneView({ onPane, onImportArchive, userMenu, onAbout }: PaneProps) {
  const languages = useLanguages()
  const analyst = useAnalyst()
  const rows: LanguageRow[] = (languages.data?.languages ?? []).map((pack) => ({
    ...pack,
    id: pack.code,
  }))
  return (
    <PickerLanguagesScreen
      languages={rows}
      busy={languages.isPending}
      analyst={analyst ?? ''}
      {...(languages.error === null ? {} : { problem: languages.error })}
      onPane={onPane}
      {...(onImportArchive ? { onImportArchive } : {})}
      userMenu={userMenu}
      onAbout={onAbout}
      onRetry={() => void languages.refetch()}
    />
  )
}

/**
 * A served audit line as the activity log draws it.
 *
 * **Two shapes, and less apart than they look.** The severity scale and the
 * channels are the same six and four words at both ends -- OCSF's, derived by
 * the server -- so only the naming moves: `outcome` is lower case on the wire
 * and title case on screen, and the labels carry `Label` suffixes the table
 * does not want. `source` is the origin the line came from, which is the
 * address.
 */
function auditRows(lines: readonly AuditLine[] | undefined): AuditRow[] {
  return (lines ?? []).map((line) => ({
    id: line.id,
    at: line.at,
    severity: line.severity,
    // The analyst's word for what happened, not the wire's event key.
    activity: line.activityName,
    channel: line.channel,
    outcome: (line.outcome.charAt(0).toUpperCase() + line.outcome.slice(1)) as AuditRow['outcome'],
    actor: line.actorLabel,
    target: line.targetLabel,
    source: line.ipAddress,
    // How many of this event sit in the same short window: the table draws a
    // multiplier rather than repeating the row, so it has to travel.
    runLength: line.runLength,
  }))
}

export function ActivityPaneView({ onPane, onImportArchive, userMenu, onAbout }: PaneProps) {
  const analyst = useAnalyst()
  const activity = useInstallActivity('all', '24h')
  return (
    <PickerActivityScreen
      audit={auditRows(activity.page?.events)}
      busy={activity.isPending}
      analyst={analyst ?? ''}
      {...(activity.error === null ? {} : { problem: activity.error })}
      onPane={onPane}
      {...(onImportArchive ? { onImportArchive } : {})}
      userMenu={userMenu}
      onAbout={onAbout}
      onRetry={activity.refetch}
    />
  )
}

export function HealthPaneView({ onPane, onImportArchive, userMenu, onAbout }: PaneProps) {
  const analyst = useAnalyst()
  // Three reads, because they answer three different questions: the readiness
  // probe says whether a dependency answered, the resources read says what
  // this machine is doing, and the activity read says what the install holds.
  const probe = useBackendHealth()
  const resources = useResources()
  const activity = useActivity()
  // **Whichever of the three did not answer, not whichever one was wired up.**
  // `busy` already unions all three; `problem` took the activity read alone,
  // so a readiness probe or a resources read that failed left the pane drawing
  // its figures from `undefined` -- blanks and dashes, no failure stated and
  // nothing to retry. An operator opens this pane to ask whether anything is
  // wrong, and that is the one answer it must not give confidently.
  const problem = probe.error ?? resources.error ?? activity.error
  return (
    <PickerHealthScreen
      health={{
        uptime: uptimeLine(resources.data?.uptimeSeconds),
        serving: servingRows(probe.data, activity.data),
        gauges: gaugeRows(resources.data),
        connections: connectionGauge(activity.data),
        figures: figureRows(activity.data),
        tables: tableRows(activity.data),
      }}
      busy={probe.isPending || resources.isPending || activity.isPending}
      {...(problem === null ? {} : { problem })}
      onRetry={() => {
        void probe.refetch()
        void resources.refetch()
        void activity.refetch()
      }}
      analyst={analyst ?? ''}
      onPane={onPane}
      {...(onImportArchive ? { onImportArchive } : {})}
      userMenu={userMenu}
      onAbout={onAbout}
    />
  )
}
