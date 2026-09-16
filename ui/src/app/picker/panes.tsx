import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

import { useCases } from '@/api/case'
import { useImportCase } from '@/api/useImportCase'
import { useAccountAction, useAccounts, useAccountWrite } from '@/api/accounts'
import { useInstallActivity, type AuditLine, type AuditPage, type RangeKey, type Severity } from '@/api/installActivity'
import { announced } from '@/app/case/entryWrites'
import { packFromFile, useLanguageRemove, useLanguageUpload, useLanguages } from '@/api/languages'
import { useLibrary } from '@/api/library'
import { useDemos } from '@/api/useDemos'
import { useSession } from '@/api/useSession'
import { useBackendHealth } from '@/api/useBackendHealth'
import { useActivity, useResources } from '@/api/useInstallHealth'
import {
  reportImportedCase,
  reportUploadedPack,
  reportWriteFailure,
} from '@/components/blocks/notify'
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

import { chosenIn, filterSetOf, type FilterDimension, type FilterSelection } from '@/components/blocks/filter-set'
import { FLOORS, LOG_LABEL, type ActivityReading, type AuditRow } from '@/components/blocks/activity-log'
import { useState } from 'react'
import type { PickerPane } from '@/components/blocks/picker-panes'
import type { AnalystAccount } from '@contract/analyst-account'
import type { AccountTableRow } from '@/components/blocks/account-table'
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
  /** The wizard that makes the case out of an incident, in one act. */
  onLiveSource?: (() => void) | undefined
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

/** Undefined until the session lands reads as an analyst, which is the safe way to be wrong. */
function useIsAdmin(): boolean {
  return useSession()?.admin === true
}

export function CasesPaneView({ onPane, onImportArchive, userMenu, onAbout }: PaneProps) {
  const cases = useCases()
  const analyst = useAnalyst()
  const admin = useIsAdmin()
  return (
    <PickerCasesScreen
      cases={cases.data ?? []}
      busy={cases.isPending}
      analyst={analyst ?? ''}
      admin={admin}
      {...(cases.error === null ? {} : { problem: cases.error })}
      onPane={onPane}
      {...(onImportArchive ? { onImportArchive } : {})}
      userMenu={userMenu}
      onAbout={onAbout}
      onRetry={() => void cases.refetch()}
    />
  )
}

export function NewPaneView({ onPane, onImportArchive, userMenu, onAbout, onBlank, onFromImporter, onLiveSource }: PaneProps) {
  const analyst = useAnalyst()
  const admin = useIsAdmin()
  return (
    <PickerNewScreen
      analyst={analyst ?? ''}
      admin={admin}
      onPane={onPane}
      {...(onImportArchive ? { onImportArchive } : {})}
      userMenu={userMenu}
      onAbout={onAbout}
      {...(onBlank ? { onBlank } : {})}
      {...(onFromImporter ? { onImport: onFromImporter } : {})}
      {...(onLiveSource ? { onLiveSource } : {})}
    />
  )
}

export function DemosPaneView({ onPane, onImportArchive, userMenu, onAbout }: PaneProps) {
  const demos = useDemos()
  const analyst = useAnalyst()
  const admin = useIsAdmin()
  return (
    <PickerDemosScreen
      // The demos are seeded at server start, so a card is a link into the
      // case that already exists rather than a call that builds one.
      href={(demo) => `/cases/${encodeURIComponent(demo.id)}/${ENTRY_SLUG}`}
      demos={demos.data ?? []}
      busy={demos.isPending}
      analyst={analyst ?? ''}
      admin={admin}
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
 * A served account as the table wants it: the same row, with an id.
 *
 * `username` is the key a route addresses an account by, so it is the identity
 * the table sorts and selects on.
 */
function accountRows(rows: readonly AnalystAccount[] | undefined): AccountTableRow[] {
  return (rows ?? []).map((row) => ({ ...row, id: row.username }))
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
  const admin = useIsAdmin()
  return (
    <PickerTemplatesScreen
      entries={libraryRows(library.data?.entries)}
      busy={library.isPending}
      analyst={analyst ?? ''}
      admin={admin}
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
  const admin = useIsAdmin()
  return (
    <PickerReportsScreen
      entries={libraryRows(library.data?.entries)}
      busy={library.isPending}
      analyst={analyst ?? ''}
      admin={admin}
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
  const admin = useIsAdmin()
  return (
    <PickerSnippetsScreen
      entries={libraryRows(library.data?.entries)}
      busy={library.isPending}
      analyst={analyst ?? ''}
      admin={admin}
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
  const admin = useIsAdmin()
  // `''` is the create path: `useAccountWrite` appends to `/accounts`.
  const create = useAccountWrite('')
  const act = useAccountAction()
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
      onEndEverySession={() => {
        act.mutate({ path: '/sessions/end' })
      }}
      onEndSessions={(username) => {
        act.mutate({ path: `/${encodeURIComponent(username)}/sessions/end` })
      }}
      onState={(username, next) => {
        // The row follows the server rather than the press: the query is
        // invalidated either way, so what is drawn is what is stored.
        act.mutate({
          path: `/${encodeURIComponent(username)}/${next === 'disabled' ? 'disable' : 'enable'}`,
        })
      }}
      accounts={accountRows(accounts.data?.accounts)}
      busy={accounts.isPending}
      analyst={analyst ?? ''}
      admin={admin}
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
  const admin = useIsAdmin()
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
      admin={admin}
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
  const admin = useIsAdmin()
  const remove = useLanguageRemove()
  const upload = useLanguageUpload()
  const rows: LanguageRow[] = (languages.data?.languages ?? []).map((pack) => ({
    ...pack,
    id: pack.code,
  }))
  return (
    <PickerLanguagesScreen
      languages={rows}
      keyCount={languages.data?.keyCount ?? 0}
      onRemove={(code) => {
        void announced('the language pack', () => remove.mutateAsync(code))
      }}
      onUpload={(file) => {
        void announced('the language pack', async () => {
          const taken = await upload.mutateAsync(await packFromFile(file))
          reportUploadedPack({ label: taken.language.label, ignored: taken.ignored })
        })
      }}
      busy={languages.isPending}
      analyst={analyst ?? ''}
      admin={admin}
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
    attributes: line.attributes,
    detailsVary: line.detailsVary,
    // How many of this event sit in the same short window: the table draws a
    // multiplier rather than repeating the row, so it has to travel.
    runLength: line.runLength,
  }))
}

/**
 * The chip rows, counted by the reader rather than over the rows on screen.
 *
 * The channel and outcome tallies are over the whole log, unnarrowed by the
 * other filters -- so a chip says how many of that kind the install holds, not
 * how many the current range would return. The severity counts are over runs
 * at the raised level, which is what pressing one returns. -> #663
 */
function activityFilters(page: AuditPage | undefined): FilterDimension[] {
  const counts = page?.counts ?? {}
  const outcomes = page?.outcomes ?? {}
  // Counted on the raised level over runs, which is what pressing the chip
  // returns -- and computed by the reader, which nothing was reading.
  const severities: Record<string, number> = page?.severities ?? {}
  return [
    {
      key: 'log',
      label: 'Log',
      mode: 'one',
      options: Object.entries(counts).map(([channel, n]) => ({
        value: channel,
        // The counts are the server's, so a channel this build has no label
        // for is shown by its own name rather than as a blank chip.
        label: (LOG_LABEL as Record<string, string | undefined>)[channel] ?? channel,
        count: n,
      })),
    },
    {
      key: 'floor',
      label: 'Severity',
      mode: 'one',
      options: FLOORS.map((name) => ({
        value: name,
        ...(severities[name] === undefined ? {} : { count: severities[name] }),
      })),
    },
    {
      key: 'outcome',
      label: 'Outcome',
      mode: 'one',
      options: Object.entries(outcomes).map(([name, n]) => ({
        value: name,
        label: name === 'failure' ? 'Failure' : 'Success',
        count: n,
      })),
    },
  ]
}

export function ActivityPaneView({ onPane, onImportArchive, userMenu, onAbout }: PaneProps) {
  const analyst = useAnalyst()
  const admin = useIsAdmin()
  const [range, setRange] = useState<RangeKey>('7d')
  const [selection, setSelection] = useState<FilterSelection>({})

  const channel = (chosenIn(selection, 'log')[0] ?? 'all') as AuditRow['channel'] | 'all'
  const floor = chosenIn(selection, 'floor')[0] as Severity | undefined
  const outcome = chosenIn(selection, 'outcome')[0] as 'success' | 'failure' | undefined

  const activity = useInstallActivity({
    channel,
    range,
    ...(floor ? { minSeverity: floor } : {}),
    ...(outcome ? { outcome } : {}),
  })

  const reading: ActivityReading = {
    range,
    onRange: (next) => {
      setRange(next)
      activity.reset()
    },
    filters: filterSetOf(activityFilters(activity.page), selection, (next) => {
      setSelection(next)
      // A narrower question has its own first page; keeping the cursor would
      // ask for the page after one this answer may not contain.
      activity.reset()
    }),
    pageNumber: activity.pageNumber,
    hasPrevious: activity.hasPrevious,
    hasNext: activity.hasNext,
    onPrevious: activity.previous,
    onNext: activity.next,
  }

  return (
    <PickerActivityScreen
      audit={auditRows(activity.page?.events)}
      reading={reading}
      busy={activity.isPending}
      analyst={analyst ?? ''}
      admin={admin}
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
  const admin = useIsAdmin()
  // Three reads, because they answer three different questions: the readiness
  // probe says whether a dependency answered, the resources read says what
  // this machine is doing, and the activity read says what the install holds.
  const probe = useBackendHealth()
  const resources = useResources()
  const activity = useActivity()
  // **Whichever of the three did not answer, not whichever one is wired up.**
  // `busy` unions all three, and a `problem` taken from one read leaves the
  // pane drawing the other two's figures from `undefined` -- blanks and
  // dashes, no failure stated and nothing to retry. An operator opens this
  // pane to ask whether anything is wrong, and that is the one answer it must
  // not give confidently.
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
      admin={admin}
      onPane={onPane}
      {...(onImportArchive ? { onImportArchive } : {})}
      userMenu={userMenu}
      onAbout={onAbout}
    />
  )
}
