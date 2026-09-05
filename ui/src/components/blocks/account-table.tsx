import { useMemo, useState } from 'react'
import { Users } from 'lucide-react'

import { matchesWords } from '@/lib/word-match'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PersonAvatar } from '@/components/blocks/presence'
import { Tab, TabList, TabPanel, Tabs } from '@/components/ui/tabs'

import { actionsColumn, DataTable, useEntityTable, type EntityColumn } from './data-table'
import { EmptyState } from './empty-state'
import { useFilters } from './filter-set'
import { FilterControls } from './filter-controls'
import { FieldToneBadge, held } from './severity-badge'
import { TableToolbar } from './table-toolbar'

/**
 * Who may sign in to this install, and what each may reach: three tabs by
 * state, a search-and-role toolbar, and the account table underneath.
 */
export interface AccountRow {
  id: string
  /** What they sign in as. */
  username: string
  /** How they are named on a case. Falls back to the username when blank. */
  displayName: string
  role: string
  /** The served word, drawn as-is: `active`, `disabled`, `locked out`. */
  state: 'active' | 'disabled' | 'locked out'
}

/** How an account sorts and how the search reads it. */
export function accountLabel(row: AccountRow): string {
  return row.displayName === '' ? row.username : row.displayName
}

/**
 * The count line beside the Accounts heading.
 */
export function accountCountLine(rows: readonly AccountRow[]): string {
  const admins = rows.filter((one) => one.role === 'admin').length
  const off = rows.filter((one) => one.state === 'disabled').length
  const parts = [
    `${String(rows.length)} account${rows.length === 1 ? '' : 's'}`,
    `${String(admins)} administrator${admins === 1 ? '' : 's'}`,
  ]
  if (off > 0) parts.push(`${String(off)} disabled`)
  return parts.join(' \u00B7 ')
}

/**
 * Whether an account matches what is typed in the roster's search box.
 */
export function matchesAccount(row: AccountRow, query: string): boolean {
  return matchesWords(`${accountLabel(row)} ${row.username}`, query)
}

/** Which accounts the tab row is showing. */
const ACCOUNT_TABS = ['All', 'Active', 'Disabled'] as const

export interface AccountTableProps {
  accounts: readonly AccountRow[]
  /**
   * Enabling and disabling are the two verbs this table can perform, and it
   * performs neither itself: the caller owns the roster, so what a tab counts
   * and what the table draws cannot drift apart.
   */
  onState: (id: string, state: AccountRow['state']) => void
}

export function AccountTable({ accounts, onState }: AccountTableProps) {
  const [tab, setTab] = useState<(typeof ACCOUNT_TABS)[number]>('All')
  const [query, setQuery] = useState('')

  const known = useMemo(() => [...new Set(accounts.map((one) => one.role))].sort(), [accounts])

  const filters = useFilters([
    {
      key: 'role',
      label: 'Role',
      options: known.map((role) => ({
        value: role,
        count: accounts.filter((one) => one.role === role).length,
      })),
    },
  ])
  const roles = filters.chosen('role')

  const rows = useMemo(
    () =>
      accounts.filter((one) => {
        if (tab === 'Active' && one.state !== 'active') return false
        if (tab === 'Disabled' && one.state !== 'disabled') return false
        if (roles.length > 0 && !roles.includes(one.role)) return false
        return matchesAccount(one, query)
      }),
    [accounts, tab, roles, query],
  )

  const columns = useMemo(() => accountColumns(onState), [onState])
  const table = useEntityTable<AccountRow>({
    data: rows,
    columns,
    meta: { pendingIds: new Set(), commit: () => undefined },
  })

  // The tab is not a token, for the reason the search box is not: it is a
  // visible control already showing its own state.
  const narrowed = query.trim() !== '' || filters.narrowed || tab !== 'All'
  const clear = () => {
    setQuery('')
    filters.clear()
    setTab('All')
  }

  // The kit's tabs rather than a hand-drawn row of buttons: the counts are the
  // point, so each tab carries its own.
  //
  // **The table is the panel.** React Aria wires `aria-controls` on the
  // selected tab whether or not a panel exists, so a list drawn without one
  // promises a region that is in no document, which axe rates critical. The
  // tab is not wrong to claim it controls something: picking a state is what
  // changes the rows.
  return (
    <Tabs
      className="flex flex-col gap-3"
      selectedKey={tab}
      onSelectionChange={(next) => {
        setTab(next as (typeof ACCOUNT_TABS)[number])
      }}
    >
      <TabList aria-label="Accounts by state">
        {ACCOUNT_TABS.map((name) => (
          <Tab key={name} id={name}>
            {name}
            {/* The token rather than the label's ink dimmed: a tab does not
                  invert, so there is nothing here for an opacity to follow --
                  and 70% of the tab's ink is a colour nobody chose. The scope
                  row's counts were the same idiom and read 3.05:1. */}
            <span className="text-xs tabular-nums text-ink-muted">
              {name === 'All'
                ? accounts.length
                : accounts.filter((one) => one.state === name.toLowerCase()).length}
            </span>
          </Tab>
        ))}
      </TabList>

      {/* One panel, carrying the selected tab's own id: React Aria puts
          `aria-controls` on the selected tab alone, so the id it names is
          always this one. Keyed by that tab, because React Aria registers a
          panel's id once -- a single panel whose `id` prop changes keeps the
          id it first had, and the tab then points at a region that is no
          longer in the document. */}
      <TabPanel key={tab} id={tab} still className="flex flex-col gap-3">
        <TableToolbar
          searchColumn="Account"
          placeholder="A name or username"
          value={query}
          onValue={setQuery}
          applied={filters.applied}
          narrowed={narrowed}
          onClear={clear}
          filters={<FilterControls {...filters.controls} />}
        />

        <DataTable
          table={table}
          label="Accounts on this install"
          scroll="page"
          empty={
            <EmptyState
              icon={Users}
              title={narrowed ? 'Nothing matches' : 'Nobody but you'}
              detail={
                narrowed
                  ? 'Drop a filter, shorten the search, or go back to every state.'
                  : 'An account is one person who can sign in to this install.'
              }
              action={
                narrowed ? (
                  <Button variant="outline" onPress={clear}>
                    Show every account
                  </Button>
                ) : undefined
              }
            />
          }
        />
      </TabPanel>
    </Tabs>
  )
}

/**
 * An account's columns.
 */
function accountColumns(
  onState: (id: string, state: AccountRow['state']) => void,
): EntityColumn<AccountRow>[] {
  return [
    {
      id: 'account',
      accessorFn: (one) => accountLabel(one),
      header: 'Account',
      meta: { className: 'font-medium' },
      cell: ({ row: one }) => (
        <span className="flex min-w-0 items-center gap-2">
          <PersonAvatar
            person={{ name: accountLabel(one.original), you: false }}
            className="size-7 text-2xs"
          />
          <span className="flex min-w-0 flex-col">
            <span className="truncate" title={accountLabel(one.original)}>
              {accountLabel(one.original)}
            </span>
            <span
              className="truncate font-mono text-2xs font-normal text-ink-muted"
              title={one.original.username}
            >
              {one.original.username}
            </span>
          </span>
        </span>
      ),
    },
    {
      accessorKey: 'role',
      header: 'Role',
      meta: { className: 'w-40' },
      cell: ({ row: one }) => (
        <Badge variant="soft" size="xs" uppercase={false}>
          {one.original.role}
        </Badge>
      ),
    },
    {
      id: 'auth',
      header: 'Auth',
      meta: { className: 'w-56' },
      enableSorting: false,
      cell: () => (
        <span className="flex flex-wrap items-center gap-1">
          <Badge variant="soft" size="xs" uppercase={false}>
            Password
          </Badge>
          <Badge variant="outlined" size="xs" uppercase={false}>
            No second factor
          </Badge>
        </span>
      ),
    },
    {
      accessorKey: 'state',
      header: 'State',
      meta: { className: 'w-40' },
      cell: ({ row: one }) => (
        <FieldToneBadge
          value={one.original.state}
          // The tone is the served word's, not the state's spelling: a locked
          // account is a thing to act on, a disabled one is a decision already
          // made.
          tone={
            one.original.state === 'locked out' ? held('critical', 'solid') : held('none', 'hollow')
          }
        />
      ),
    },
    actionsColumn<AccountRow>(
      (one) => accountLabel(one),
      (one) => [
        [
          // Resetting a password mints one and mails it, which is the server's
          // and cannot be stood in for. Offered and refused rather than
          // offered and inert.
          {
            id: 'reset',
            label: 'Reset password\u2026',
            disabled: true,
            onSelect: () => undefined,
          },
          one.state === 'disabled'
            ? {
                id: 'enable',
                label: 'Enable',
                onSelect: () => {
                  onState(one.id, 'active')
                },
              }
            : {
                id: 'disable',
                label: 'Disable\u2026',
                danger: true,
                onSelect: () => {
                  onState(one.id, 'disabled')
                },
              },
        ],
      ],
      // Neither verb is the row's own: a password is reset and an account is
      // disabled, and both are their own confirmation.
      () => ({ edit: false, delete: false }),
    ),
  ]
}
