import { ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { usePersistedFlag } from '@/lib/persistedFlag'
import { cn } from '@/lib/cn'

/**
 * A foldable group of rail rows.
 */
export function RailGroup({
  label,
  storageKey,
  holdsCurrent,
  testId,
  children,
}: {
  label: string | null
  storageKey: string
  /** Forces the group open. */
  holdsCurrent: boolean
  testId: string
  children: ReactNode
}) {
  const [open, toggle] = usePersistedFlag(storageKey, true)
  const shown = open || holdsCurrent

  if (label === null) return <SidebarGroup>{children}</SidebarGroup>

  return (
    <SidebarGroup>
      <SidebarGroupLabel data-testid={testId} className="relative flex items-center">
        {label}
        <RailFold open={shown} title={label} slug={testId} onToggle={toggle} />
      </SidebarGroupLabel>
      {shown && children}
    </SidebarGroup>
  )
}

/**
 * The room a row leaves on its right for a fold control laid over it.
 */
const RESERVE = 'mr-8 block'

/** Wraps `node` in the reserve when the caller asked for one. */
function Reserved({ on, children }: { on: boolean; children: ReactNode }) {
  if (!on) return children
  return (
    <div data-slot="rail-reserve" className={RESERVE}>
      {children}
    </div>
  )
}

/**
 * One row in the rail: a destination, or a control that acts.
 */
export function RailRow({
  bare = false,
  icon: Icon,
  mark,
  label,
  qualifier,
  tooltip,
  testId,
  to,
  onSelect,
  active,
  deferToChild = false,
  alsoActive = false,
  level = 'top',
  reserveRight = false,
  count,
  countLabel,
  countTestId,
}: {
  icon?: LucideIcon | undefined
  /** Drawn instead of `icon` - an avatar, a swatch. */
  mark?: ReactNode | undefined
  label: string
  /** A short word after the label. */
  qualifier?: ReactNode | undefined
  /** Tooltip text while folded. Falls back to `label`. */
  tooltip?: string | undefined
  testId?: string | undefined
  /** A route. Mutually exclusive with `onSelect`. */
  to?: string | undefined
  onSelect?: (() => void) | undefined
  /** Overrides the router's own answer. */
  active?: boolean | undefined
  /** Suppresses the active mark because a child row carries it. */
  deferToChild?: boolean | undefined
  /** Marks active without being the current route. */
  alsoActive?: boolean | undefined
  level?: 'top' | 'sub' | undefined
  /** Leaves room on the right for a fold control. */
  reserveRight?: boolean | undefined
  count?: number | undefined
  countLabel?: string | undefined
  countTestId?: string | undefined
  /**
   * Render the row without its own list item.
   */
  bare?: boolean | undefined
}) {
  const { open } = useSidebar()
  const collapsed = !open

  const body = (isActive: boolean) => (
    <SidebarMenuButton
      isActive={isActive}
      tooltip={tooltip ?? label}
      className={railActive(level)}
      {...(to === undefined && onSelect ? { onClick: onSelect } : {})}
      {...(testId === undefined ? {} : { 'data-testid': testId })}
    >
      {isActive && <RailActiveEdge />}
      {mark ?? (Icon ? <Icon aria-hidden /> : null)}
      {!collapsed && (
        <span className="truncate" title={tooltip ?? label}>
          {label}
        </span>
      )}
      {!collapsed && qualifier !== undefined && <RailQualifier>{qualifier}</RailQualifier>}
      {count !== undefined && count > 0 && (
        <SidebarMenuBadge>
          <Badge
            size="count"
            variant="solid"
            {...(countTestId === undefined ? {} : { 'data-testid': countTestId })}
            {...(countLabel === undefined ? {} : { 'aria-label': countLabel })}
            className="bg-severity-info text-on-severity"
          >
            {count}
          </Badge>
        </SidebarMenuBadge>
      )}
    </SidebarMenuButton>
  )

  // One decision, read by both branches: nothing is laid over a folded row.
  const reserved = reserveRight && open

  const inner =
    to === undefined ? (
      <Reserved on={reserved}>{body(active ?? false)}</Reserved>
    ) : (
      <NavLink to={to} {...(reserved ? { 'data-slot': 'rail-reserve' } : {})}
        className={cn(reserved && RESERVE)}>
        {({ isActive }) => body(((active ?? isActive) || alsoActive) && !deferToChild)}
      </NavLink>
    )

  if (bare) return inner
  return <SidebarMenuItem>{inner}</SidebarMenuItem>
}

/** The bar marking the current row. Decorative; the row carries `aria-current`. */
export function RailActiveEdge() {
  return (
    <span
      aria-hidden
      data-testid="rail-active-edge"
      className="absolute inset-y-1 left-0 w-(--rail-active-w) [--rail-active-w:3px] rounded-full bg-sidebar-primary"
    />
  )
}

/**
 * The class a row takes at each level.
 */
export function railActive(level: 'top' | 'sub'): string {
  return level === 'top'
    ? 'relative data-[active=true]:border data-[active=true]:border-sidebar-border'
    : 'relative ps-5'
}

/** The chevron folding a group. */
export function RailFold({
  open,
  title,
  slug,
  onToggle,
}: {
  open: boolean
  title: string
  slug: string
  onToggle: () => void
}) {
  const { open: unfolded } = useSidebar()
  const Glyph = open ? ChevronDown : ChevronRight
  // Unfolded only: there is nothing to fold to in a 72px strip, and a chevron
  // beside the glyph takes the row off the centre line. Decided here rather
  // than in a class, which the rail carries no `group` for a selector to reach.
  if (!unfolded) return null
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
      data-testid={`rail-fold-${slug}`}
      data-slot="rail-fold"
      className="absolute right-1 inline-flex size-6 items-center justify-center rounded text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
      onClick={onToggle}
    >
      <Glyph aria-hidden className="size-3.5" />
    </button>
  )
}

/** A short word after a row's label - a scope, an origin. */
export function RailQualifier({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <span
      data-slot="rail-qualifier"
      className={cn(
        'ml-auto shrink-0 rounded-sm border border-sidebar-border px-1 py-px',
        'text-[9px] leading-[1.4] tracking-wide text-sidebar-muted-foreground uppercase',
        className,
      )}
    >
      {children}
    </span>
  )
}
