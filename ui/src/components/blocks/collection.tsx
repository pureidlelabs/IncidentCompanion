import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { AsyncBoundary } from '@/components/ui/async-boundary'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

import { DataTable, type DataTableProps } from './data-table'
import { EmptyState } from './empty-state'
import { FilterControls } from './filter-controls'
import type { FilterSet } from './filter-set'
import { MetaBadge } from './section-head'
import { Section } from './section'
import { TableToolbar } from './table-toolbar'

/**
 * The whole of a collection screen: a head, a search and filter row, a table,
 * an empty state, and whatever the screen pins under it.
 */

/** The search box's binding. The block draws the box; the screen holds the text. */
export interface CollectionSearch {
  /** The column heading the box names, so the row says which field it searches. */
  column: string
  /** Greyed text inside the empty box. */
  placeholder: string
  /** The search text. Controlled. */
  value: string
  /** Fires on every keystroke, and with `''` when the box or `Clear` is pressed. */
  onValue: (next: string) => void
}

/**
 * What a screen says when it has no rows to draw.
 */
export interface CollectionEmpty {
  title: string
  /** One line under the title. */
  detail: string
  icon?: LucideIcon | undefined
  /**
   * The way in, offered only while nothing is narrowing the table.
   */
  action?: ReactNode | undefined
}

/** A warning about the rows, drawn above them. */
export interface CollectionNotice {
  title: ReactNode
  detail: ReactNode
}

/**
 * Where the rows are in a read that can be in flight or have failed.
 */
export interface CollectionRead {
  isPending: boolean
  isError: boolean
  error?: unknown
  refetch?: (() => void) | undefined
}

export interface CollectionProps<TData extends { id: string }> {
  title: ReactNode
  /** Beside the title: how many rows, or how they divide. The screen's words. */
  meta?: string | undefined
  /** One line under the title. Say the consequence, never the rationale. */
  blurb?: ReactNode | undefined
  /** The screen's own controls, right-aligned on the head's first line. */
  actions?: ReactNode | undefined
  /** At the far end of the toolbar: a bulk-action bar, an import control. */
  toolbarEnd?: ReactNode | undefined
  /**
   * Pinned under the table: an export row, a pager.
   */
  footer?: ReactNode | undefined
  search: CollectionSearch
  /** `useFilters`' result. The block reads it, draws it and clears it. */
  filters: FilterSet
  notice?: CollectionNotice | undefined
  read?: CollectionRead | undefined
  /** Everything `DataTable` takes except its empty state, which is `empty`. */
  table: Omit<DataTableProps<TData>, 'empty'>
  empty: CollectionEmpty
  /** The screen's dialogs. */
  children?: ReactNode
}

/** What every collection says when a filter has hidden the last row. */
const NARROWED_TITLE = 'Nothing matches'
const NARROWED_DETAIL = 'Drop a filter or shorten the search.'

export function Collection<TData extends { id: string }>({
  title,
  meta,
  blurb,
  actions,
  toolbarEnd,
  footer,
  search,
  filters,
  notice,
  read,
  table,
  empty,
  children,
}: CollectionProps<TData>) {
  // Spaces are not a search: a box holding them would otherwise put `Clear` on
  // a table nothing is filtering, and answer an empty case with `Nothing
  // matches`.
  const narrowed = Boolean(search.value.trim()) || filters.narrowed

  return (
    <Section
      // Bounded so the table's own scrollport has a height to shrink against,
      // and not the scrollport itself -- the table is.
      fills
      scrolls={false}
      title={title}
      {...(meta === undefined ? {} : { meta: <MetaBadge>{meta}</MetaBadge> })}
      {...(blurb === undefined ? {} : { blurb })}
      {...(actions === undefined ? {} : { actions })}
      {...(footer === undefined ? {} : { footer })}
      toolbar={
        <TableToolbar
          searchColumn={search.column}
          placeholder={search.placeholder}
          value={search.value}
          onValue={search.onValue}
          applied={filters.applied}
          narrowed={narrowed}
          onClear={() => {
            search.onValue('')
            filters.clear()
          }}
          {...(toolbarEnd === undefined ? {} : { end: toolbarEnd })}
          filters={<FilterControls {...filters.controls} />}
        />
      }
    >
      {notice && (
        <Alert variant="warning" className="mb-3">
          <AlertTitle>{notice.title}</AlertTitle>
          <AlertDescription>{notice.detail}</AlertDescription>
        </Alert>
      )}

      <AsyncBoundary
        isPending={read?.isPending ?? false}
        isError={read?.isError ?? false}
        {...(read?.error === undefined ? {} : { error: read.error })}
        {...(read?.refetch === undefined ? {} : { refetch: read.refetch })}
      >
        <DataTable
          {...table}
          empty={
            <EmptyState
              title={narrowed ? NARROWED_TITLE : empty.title}
              detail={narrowed ? NARROWED_DETAIL : empty.detail}
              {...(empty.icon === undefined ? {} : { icon: empty.icon })}
              {...(narrowed || empty.action === undefined ? {} : { action: empty.action })}
            />
          }
        />
      </AsyncBoundary>

      {children}
    </Section>
  )
}
