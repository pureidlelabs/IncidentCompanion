import { ChevronRight, ChevronsUpDown, PanelLeft } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  Button as AriaButton,
  Disclosure as AriaDisclosure,
  DisclosurePanel as AriaDisclosurePanel,
  Heading,
  composeRenderProps,
  type ButtonProps as AriaButtonProps,
} from 'react-aria-components'
import { tv } from 'tailwind-variants'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/cn'

/** Toggles the rail. Matched with the meta/ctrl modifier. */
const TOGGLE_KEY = 'b'

interface SidebarContextValue {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

/** Throws outside a `SidebarProvider`, rather than rendering a rail that cannot fold. */
export function useSidebar(): SidebarContextValue {
  const value = useContext(SidebarContext)
  if (value === null) throw new Error('useSidebar must be used inside a SidebarProvider')
  return value
}

export interface SidebarProviderProps {
  /** Uncontrolled starting state. */
  defaultOpen?: boolean
  /** Controlled state. Pass with `onOpenChange`. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: ReactNode
  className?: string
}

/**
 * Holds the rail's folded state and binds the toggle shortcut.
 *
 * - Controlled when `open` is passed, uncontrolled otherwise.
 * - Binds meta/ctrl + `b` on `window` for as long as it is mounted.
 * - Persists nothing. Wrap it or pass `open` to keep the state across a reload.
 */
export function SidebarProvider({
  defaultOpen = true,
  open,
  onOpenChange,
  children,
  className,
}: SidebarProviderProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen)
  const isOpen = open ?? uncontrolled

  const setOpen = useCallback(
    (next: boolean) => {
      if (open === undefined) setUncontrolled(next)
      onOpenChange?.(next)
    },
    [open, onOpenChange],
  )

  const toggle = useCallback(() => {
    setOpen(!isOpen)
  }, [isOpen, setOpen])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === TOGGLE_KEY && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [toggle])

  const value = useMemo(() => ({ open: isOpen, setOpen, toggle }), [isOpen, setOpen, toggle])

  return (
    <SidebarContext.Provider value={value}>
      <div
        data-slot="sidebar-provider"
        data-state={isOpen ? 'expanded' : 'collapsed'}
        className={cn('flex min-h-0 w-full', className)}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  )
}

const sidebar = tv({
  base: [
    'flex shrink-0 flex-col gap-2 overflow-hidden border-border bg-sidebar text-sidebar-foreground',
    'transition-[width] duration-(--duration-slow) ease-(--ease-out) motion-reduce:transition-none',
  ],
  variants: {
    side: { left: 'border-r', right: 'border-l order-last' },
    open: { true: 'w-(--rail-width)', false: 'w-(--rail-width-collapsed)' },
  },
  defaultVariants: { side: 'left', open: true },
})

export interface SidebarProps extends React.ComponentProps<'aside'> {
  /** Which edge it sits on. `right` also moves it after the inset in source order. */
  side?: 'left' | 'right'
}

/**
 * The rail itself. Width comes from `--rail-width` and `--rail-width-collapsed`.
 *
 * Compose as `Sidebar > SidebarHeader + SidebarContent + SidebarFooter`.
 * Renders an `aside`; give it an `aria-label` where a page has more than one.
 */
export function Sidebar({ side = 'left', className, ...props }: SidebarProps) {
  const { open } = useSidebar()
  return (
    <aside
      data-slot="sidebar"
      data-state={open ? 'expanded' : 'collapsed'}
      data-side={side}
      className={cn(sidebar({ side, open }), className)}
      {...props}
    />
  )
}

/** The region beside the rail. Renders a `main`, so there is one per page. */
export function SidebarInset({ className, ...props }: React.ComponentProps<'main'>) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn('flex min-h-0 min-w-0 flex-1 flex-col', className)}
      {...props}
    />
  )
}

/** Folds and unfolds the rail. Announces its state with `aria-expanded`. */
export function SidebarTrigger({
  className,
  testId,
}: {
  className?: string
  /** Rendered as `data-testid`, for a suite that looks the control up by name. */
  testId?: string
}) {
  const { open, toggle } = useSidebar()
  return (
    <Button
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon-sm"
      aria-label={open ? 'Fold the rail' : 'Unfold the rail'}
      aria-expanded={open}
      onPress={toggle}
      {...(testId === undefined ? {} : { 'data-testid': testId })}
      {...(className === undefined ? {} : { className })}
    >
      <PanelLeft aria-hidden className="size-4" />
    </Button>
  )
}

/**
 * Above the rail's rows.
 *
 * Ruled off from the content below it: what the rail is *showing* and where it
 * can take you are two things, and without an edge the switcher read as the
 * first row of the menu.
 */
export function SidebarHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-header"
      className={cn('flex shrink-0 flex-col gap-2 border-b border-sidebar-border p-2', className)}
      {...props}
    />
  )
}

/** Below the rail's rows, ruled off from them for the reason the header is. */
export function SidebarFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-footer"
      className={cn('mt-auto flex shrink-0 flex-col gap-2 border-t border-sidebar-border p-2', className)}
      {...props}
    />
  )
}

/** The scrolling middle. Renders a `nav`. */
export function SidebarContent({ className, ...props }: React.ComponentProps<'nav'>) {
  return (
    <nav
      data-slot="sidebar-content"
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-0 overflow-x-hidden overflow-y-auto',
        '[scrollbar-width:thin] [scrollbar-color:var(--sidebar-border)_transparent]',
        className,
      )}
      {...props}
    />
  )
}

export function SidebarGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-group"
      className={cn('relative flex w-full min-w-0 flex-col p-2', className)}
      {...props}
    />
  )
}

/** Names a group. Hidden when the rail is folded, since there is no room to read it. */
export function SidebarGroupLabel({ className, ...props }: React.ComponentProps<'div'>) {
  const { open } = useSidebar()
  return (
    <div
      data-slot="sidebar-group-label"
      className={cn(
        'flex h-(--control-h-md) shrink-0 items-center rounded-md px-2 text-xs font-medium',
        'text-sidebar-foreground/70 transition-[margin,opacity] duration-(--duration-base) ease-(--ease-out)',
        // Folded it pulls up and fades rather than disappearing, so the rows
        // above and below do not jump.
        !open && '-mt-(--control-h-md) opacity-0',
        className,
      )}
      {...props}
    />
  )
}

export interface SidebarCollapsibleGroupProps {
  children: ReactNode
  className?: string
  /** Uncontrolled starting state. */
  defaultExpanded?: boolean
  /** Controlled state. Pass with `onExpandedChange`. */
  isExpanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
}

/**
 * A group that folds, over React Aria's `Disclosure`.
 *
 * Compose as `SidebarCollapsibleGroup > SidebarGroupTrigger +
 * SidebarGroupPanel`. Folding the rail forces the panel open, because the
 * trigger is not readable at that width and a folded group would leave the
 * rows unreachable.
 */
export function SidebarCollapsibleGroup({
  children,
  className,
  defaultExpanded = true,
  isExpanded,
  onExpandedChange,
}: SidebarCollapsibleGroupProps) {
  const { open } = useSidebar()
  const [uncontrolled, setUncontrolled] = useState(defaultExpanded)
  const expanded = isExpanded ?? uncontrolled

  return (
    <AriaDisclosure
      isExpanded={open ? expanded : true}
      onExpandedChange={(next) => {
        if (isExpanded === undefined) setUncontrolled(next)
        onExpandedChange?.(next)
      }}
      data-slot="sidebar-group"
      className={cn('group/sidebar-group relative flex w-full min-w-0 flex-col p-2', className)}
    >
      {children}
    </AriaDisclosure>
  )
}

/**
 * The group's name and its fold control, in one row.
 *
 * The chevron is always drawn: right while the group is folded, down while it
 * is open. Carries `slot="trigger"`, which is how React Aria hands it the
 * press handler and `aria-expanded`.
 */
export function SidebarGroupTrigger({
  children,
  className,
  level = 3,
}: {
  children: ReactNode
  className?: string
  /** Heading level the group sits at in the page outline. */
  level?: number
}) {
  const { open } = useSidebar()
  return (
    <Heading level={level} className="m-0">
      <AriaButton
        slot="trigger"
        data-slot="sidebar-group-trigger"
        className={cn(
          'flex h-(--control-h-md) w-full shrink-0 cursor-pointer items-center gap-1 rounded-md',
          'px-2 text-xs font-medium outline-hidden select-none',
          'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          'focus-visible:ring-2 focus-visible:ring-sidebar-ring',
          'transition-[margin,opacity] duration-(--duration-base) ease-(--ease-out)',
          // Folded it pulls up and fades, exactly as `SidebarGroupLabel` does,
          // so the rows above and below do not jump.
          !open && 'pointer-events-none -mt-(--control-h-md) opacity-0',
          className,
        )}
      >
        <ChevronRight
          aria-hidden
          className={cn(
            'size-3.5 shrink-0',
            'transition-transform duration-(--duration-fast) ease-(--ease-out)',
            'group-data-[expanded]/sidebar-group:rotate-90 motion-reduce:transition-none',
          )}
        />
        <span className="min-w-0 flex-1 truncate text-left">{children}</span>
      </AriaButton>
    </Heading>
  )
}

/** What a collapsible group folds away. Stays in the DOM while folded. */
export function SidebarGroupPanel({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <AriaDisclosurePanel
      data-slot="sidebar-group-panel"
      className={cn('overflow-hidden', className)}
    >
      {children}
    </AriaDisclosurePanel>
  )
}

export function SidebarMenu({ className, ...props }: React.ComponentProps<'ul'>) {
  return (
    <ul
      data-slot="sidebar-menu"
      className={cn('flex w-full min-w-0 flex-col gap-1', className)}
      {...props}
    />
  )
}

export function SidebarMenuItem({ className, ...props }: React.ComponentProps<'li'>) {
  return <li data-slot="sidebar-menu-item" className={cn('relative', className)} {...props} />
}

const menuButton = tv({
  base: [
    'flex w-full min-w-0 items-center gap-2 rounded-md p-2 text-left text-sm outline-hidden',
    'text-sidebar-foreground transition-[width,height,padding]',
    'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
    'active:bg-sidebar-accent active:text-sidebar-accent-foreground',
    'focus-visible:ring-2 focus-visible:ring-sidebar-ring',
    '[&_svg]:size-4 [&_svg]:shrink-0 [&>span:last-child]:truncate',
  ],
  variants: {
    size: {
      default: 'h-(--control-h-md) text-sm',
      sm: 'h-(--control-h-sm) text-xs',
      lg: 'h-(--control-h-lg) text-sm',
    },
    isActive: {
      true: 'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
      false: '',
    },
    // Collapsed the row is a square around its glyph, and the label is gone.
    //
    // **`mx-auto` is what puts the glyph on the rail's centre line.**
    // `justify-center` only centres the glyph inside the button; the button is
    // a 32px square inside a 55px row, so without this it sits at the row's
    // left edge. Measured folded: the row centres at 35.5 in a 72px rail and
    // the button centred at 24, so every nav glyph sat 11.5px left of the
    // header's and the footer's, and the column read as bent.
    // **`gap-0` matters as much as the centring.** The row keeps its label in
    // the DOM while folded, so `gap-2` still reserves 8px beside a glyph that
    // now has nothing next to it, and the glyph lands half a gap -- 4px -- left
    // of the square it sits in. Centred box, off-centre mark.
    folded: { true: 'mx-auto size-(--control-h-md)! justify-center gap-0! p-2!', false: '' },
  },
  defaultVariants: { size: 'default', isActive: false, folded: false },
})

export interface SidebarMenuButtonProps extends React.ComponentProps<'button'> {
  /** Marks the current destination. Sets `aria-current="page"`. */
  isActive?: boolean
  size?: 'default' | 'sm' | 'lg'
  /** Shown as a tooltip while the rail is folded, where the label is not readable. */
  tooltip?: string
}

/**
 * One destination in the rail.
 *
 * - Renders a `button`. Wrap in a link at the call site where it navigates.
 * - `tooltip` is applied only while folded; expanded, the label is on screen.
 * - Children are hidden while folded, leaving the glyph centred.
 */
export function SidebarMenuButton({
  isActive = false,
  size = 'default',
  tooltip,
  className,
  children,
  ...props
}: SidebarMenuButtonProps) {
  const { open } = useSidebar()

  const button = (
    <button
      type="button"
      data-slot="sidebar-menu-button"
      data-active={isActive}
      {...(isActive ? { 'aria-current': 'page' as const } : {})}
      className={cn(menuButton({ size, isActive, folded: !open }), className)}
      {...props}
    >
      {children}
    </button>
  )

  if (tooltip === undefined || open) return button

  return (
    <TooltipTrigger delay={0}>
      {button}
      <Tooltip placement="right">{tooltip}</Tooltip>
    </TooltipTrigger>
  )
}

export interface SidebarHeaderMenuButtonProps extends Omit<AriaButtonProps, 'children'> {
  /** The mark at the row's head - an icon, an `Avatar`, a swatch. */
  mark?: ReactNode
  /** The first line: what is being switched. */
  label: ReactNode
  /** The second line, under the label. */
  caption?: ReactNode
  /** Shown as a tooltip while the rail is folded, where neither line is readable. */
  tooltip?: string
}

/**
 * The full-width row at the head of the rail that opens a menu - the case or
 * workspace switcher.
 *
 * Renders React Aria's `Button`, so it is the trigger a kit `MenuTrigger`
 * wraps; a `SidebarMenuButton` here renders a plain button and opens nothing.
 * Folded, it is the mark alone in a square, with `tooltip` carrying the name.
 */
export function SidebarHeaderMenuButton({
  mark,
  label,
  caption,
  tooltip,
  className,
  ...props
}: SidebarHeaderMenuButtonProps) {
  const { open } = useSidebar()

  const button = (
    <AriaButton
      data-slot="sidebar-header-menu-button"
      {...props}
      className={composeRenderProps(className, (resolved) =>
        cn(
          menuButton({ size: 'lg', folded: !open }),
          'aria-expanded:bg-sidebar-accent aria-expanded:text-sidebar-accent-foreground',
          resolved,
        ),
      )}
    >
      {mark !== undefined && (
        <span
          className={cn(
            'flex shrink-0 items-center justify-center rounded-md',
            open
              ? 'size-7 bg-sidebar-primary text-sidebar-primary-foreground'
              : 'size-4 text-sidebar-foreground',
          )}
        >
          {mark}
        </span>
      )}
      {open && (
        <>
          <span className="flex min-w-0 flex-1 flex-col text-left leading-tight">
            <span className="truncate text-sm font-medium">{label}</span>
            {caption !== undefined && (
              <span className="truncate text-xs text-sidebar-muted-foreground">{caption}</span>
            )}
          </span>
          <ChevronsUpDown
            aria-hidden
            className="ml-auto size-4 shrink-0 text-sidebar-muted-foreground"
          />
        </>
      )}
    </AriaButton>
  )

  if (tooltip === undefined || open) return button

  return (
    <TooltipTrigger delay={0}>
      {button}
      <Tooltip placement="right">{tooltip}</Tooltip>
    </TooltipTrigger>
  )
}

/** A count beside a destination. Absent while folded, where it would sit on the glyph. */
export function SidebarMenuBadge({ className, ...props }: React.ComponentProps<'span'>) {
  const { open } = useSidebar()
  if (!open) return null
  return (
    <span
      data-slot="sidebar-menu-badge"
      className={cn(
        'pointer-events-none absolute top-1.5 right-1 flex h-5 min-w-5 items-center justify-center',
        'rounded-md px-1 text-xs font-medium tabular-nums text-sidebar-foreground',
        className,
      )}
      {...props}
    />
  )
}

/** The nested list under a destination. Absent while folded. */
export function SidebarMenuSub({ className, ...props }: React.ComponentProps<'ul'>) {
  const { open } = useSidebar()
  if (!open) return null
  return (
    <ul
      data-slot="sidebar-menu-sub"
      className={cn(
        'mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5',
        className,
      )}
      {...props}
    />
  )
}

export function SidebarMenuSubItem({ className, ...props }: React.ComponentProps<'li'>) {
  return <li data-slot="sidebar-menu-sub-item" className={cn('relative', className)} {...props} />
}

/** A rule between groups, at the rail's own border colour. */
export function SidebarSeparator({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-separator"
      role="separator"
      className={cn('mx-2 h-px shrink-0 bg-sidebar-border', className)}
      {...props}
    />
  )
}

export { sidebar as sidebarVariants, menuButton as sidebarMenuButtonVariants }
