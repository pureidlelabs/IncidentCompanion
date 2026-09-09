import { ChevronsUpDown, PanelLeft } from 'lucide-react'
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
  Link as AriaLink,
  composeRenderProps,
  type ButtonProps as AriaButtonProps,
} from 'react-aria-components'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip'
import { cn, tv } from '@/lib/cn'

/**
 * The rail: the column of destinations beside every screen, which folds to a
 * strip of glyphs.
 *
 * Compose as `RailShell > Rail + RailPage`, and inside the rail
 * `RailHead + RailBody + RailFoot`, with `RailSection > RailList > RailItem >
 * RailRow` for the destinations. A `RailSwitcher` is the menu row at the head
 * or the foot. Everything reads the fold from `RailShell`.
 */

/** Folds the rail. Matched with the meta/ctrl modifier. */
const FOLD_KEY = 'b'

interface RailFold {
  folded: boolean
  setFolded: (folded: boolean) => void
  toggle: () => void
}

const RailContext = createContext<RailFold | null>(null)

/** Throws outside a `RailShell`, rather than drawing a rail that cannot fold. */
export function useRail(): RailFold {
  const value = useContext(RailContext)
  if (value === null) throw new Error('useRail must be used inside a RailShell')
  return value
}

export interface RailShellProps {
  /** Uncontrolled starting state. */
  defaultFolded?: boolean
  /** Controlled state. Pass with `onFoldedChange`. */
  folded?: boolean
  onFoldedChange?: (folded: boolean) => void
  children: ReactNode
  className?: string
}

/**
 * The row holding the rail and the page, and the fold they share.
 *
 * Binds meta/ctrl + `b` on `window` while mounted. Persists nothing: pass
 * `folded` to keep the state across a reload.
 */
export function RailShell({
  defaultFolded = false,
  folded,
  onFoldedChange,
  children,
  className,
}: RailShellProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultFolded)
  const isFolded = folded ?? uncontrolled

  const setFolded = useCallback(
    (next: boolean) => {
      if (folded === undefined) setUncontrolled(next)
      onFoldedChange?.(next)
    },
    [folded, onFoldedChange],
  )

  const toggle = useCallback(() => {
    setFolded(!isFolded)
  }, [isFolded, setFolded])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === FOLD_KEY && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [toggle])

  const value = useMemo(
    () => ({ folded: isFolded, setFolded, toggle }),
    [isFolded, setFolded, toggle],
  )

  return (
    <RailContext.Provider value={value}>
      <div
        data-part="rail-shell"
        {...(isFolded ? { 'data-folded': '' } : {})}
        className={cn('flex min-h-0 w-full', className)}
      >
        {children}
      </div>
    </RailContext.Provider>
  )
}

const rail = tv({
  base: [
    'flex shrink-0 flex-col gap-2 overflow-hidden border-r border-border bg-rail text-rail-ink',
    'transition-[width] duration-(--duration-slow) ease-(--ease-out)',
  ],
  variants: {
    folded: { true: 'w-(--rail-width-collapsed)', false: 'w-(--rail-width)' },
  },
})

/**
 * The rail itself, an `aside`. Width is `--rail-width`, or
 * `--rail-width-collapsed` folded. Give it an `aria-label` where a page has
 * more than one.
 */
export function Rail({ className, ...props }: React.ComponentProps<'aside'>) {
  const { folded } = useRail()
  return (
    <aside
      data-part="rail"
      {...(folded ? { 'data-folded': '' } : {})}
      className={cn(rail({ folded }), className)}
      {...props}
    />
  )
}

/** The page beside the rail. Renders `main`, so there is one per document. */
export function RailPage({ className, ...props }: React.ComponentProps<'main'>) {
  return (
    <main
      data-part="rail-page"
      className={cn('flex min-h-0 min-w-0 flex-1 flex-col', className)}
      {...props}
    />
  )
}

/** Folds and unfolds the rail. Announces the rail's state with `aria-expanded`. */
export function RailToggle({
  className,
  testId,
}: {
  className?: string
  /** Rendered as `data-testid`, for a suite that looks the control up by name. */
  testId?: string
}) {
  const { folded, toggle } = useRail()
  return (
    <Button
      data-part="rail-toggle"
      variant="ghost"
      size="icon-sm"
      aria-label={folded ? 'Unfold the rail' : 'Fold the rail'}
      aria-expanded={!folded}
      onPress={toggle}
      {...(testId === undefined ? {} : { 'data-testid': testId })}
      {...(className === undefined ? {} : { className })}
    >
      <PanelLeft aria-hidden className="size-4" />
    </Button>
  )
}

/**
 * Above the rows, ruled off from them: what the rail is showing and where it
 * can take you are two things.
 */
export function RailHead({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-part="rail-head"
      className={cn('flex shrink-0 flex-col gap-2 border-b border-rail-border p-2', className)}
      {...props}
    />
  )
}

/** Below the rows, ruled off from them for the reason the head is. */
export function RailFoot({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-part="rail-foot"
      className={cn(
        'mt-auto flex shrink-0 flex-col gap-2 border-t border-rail-border p-2',
        className,
      )}
      {...props}
    />
  )
}

/** The scrolling middle, a `nav`. */
export function RailBody({ className, ...props }: React.ComponentProps<'nav'>) {
  return (
    <nav
      data-part="rail-body"
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto',
        '[scrollbar-width:thin] [scrollbar-color:var(--rail-border)_transparent]',
        className,
      )}
      {...props}
    />
  )
}

/** A run of rows under one heading. */
export function RailSection({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-part="rail-section"
      className={cn('relative flex w-full min-w-0 flex-col p-2', className)}
      {...props}
    />
  )
}

/**
 * Names a section. Folded it pulls up and fades rather than disappearing, so
 * the rows around it do not jump, and goes `invisible` at the end of that so
 * neither a reader nor a click finds the box.
 */
export function RailSectionHeading({ className, ...props }: React.ComponentProps<'div'>) {
  const { folded } = useRail()
  return (
    <div
      data-part="rail-section-heading"
      className={cn(
        'flex h-(--control-h-md) shrink-0 items-center rounded-md px-2 text-xs font-medium',
        'text-rail-ink/70 transition-[margin,opacity,visibility] duration-(--duration-base) ease-(--ease-out)',
        folded && 'invisible -mt-(--control-h-md) opacity-0',
        className,
      )}
      {...props}
    />
  )
}

export function RailList({ className, ...props }: React.ComponentProps<'ul'>) {
  return (
    <ul
      data-part="rail-list"
      className={cn('flex w-full min-w-0 flex-col gap-1', className)}
      {...props}
    />
  )
}

export function RailItem({ className, ...props }: React.ComponentProps<'li'>) {
  return <li data-part="rail-item" className={cn('relative', className)} {...props} />
}

const row = tv({
  base: [
    'relative flex w-full min-w-0 items-center gap-2 rounded-md p-2 text-left text-sm outline-hidden',
    'h-(--control-h-md) cursor-default text-rail-ink transition-[width,height,padding]',
    'hover:bg-rail-highlight hover:text-on-rail-highlight',
    'pressed:bg-rail-highlight pressed:text-on-rail-highlight',
    'focus-visible:ring-2 focus-visible:ring-rail-ring',
    // `:not([class*='size-'])` so a caller that names a size wins: an
    // unguarded arbitrary variant outranks the element's own utility.
    'icon-4 [&_svg]:shrink-0 [&>span:last-child]:truncate',
  ],
  variants: {
    isActive: {
      true: 'bg-rail-highlight font-medium text-on-rail-highlight',
      false: '',
    },
    // Folded the row is a square around its glyph. `mx-auto` puts the glyph on
    // the rail's centre line, which `justify-center` alone does not: the square
    // is narrower than the row. `gap-0`, because the label is still in the
    // DOM at zero width and would otherwise keep its gap beside the glyph.
    folded: { true: 'mx-auto size-(--control-h-md)! justify-center gap-0! p-2!', false: '' },
  },
  defaultVariants: { isActive: false, folded: false },
})

export interface RailRowProps {
  /** A destination. Renders a link; the app's router takes it. */
  href?: string | undefined
  /** An act. Renders a button. Ignored when `href` is given. */
  onPress?: (() => void) | undefined
  /** Marks the current destination and sets `aria-current="page"`. */
  isActive?: boolean | undefined
  /** Read while the rail is folded, where the label is not. */
  tooltip?: string | undefined
  className?: string | undefined
  children: ReactNode
  'aria-label'?: string | undefined
  'data-testid'?: string | undefined
}

/**
 * One row in the rail: a destination or an act.
 *
 * Folded, the children other than the glyph should not be drawn; the row
 * becomes a square and `tooltip` carries the name.
 */
export function RailRow({
  href,
  onPress,
  isActive = false,
  tooltip,
  className,
  children,
  'aria-label': ariaLabel,
  'data-testid': testId,
}: RailRowProps) {
  const { folded } = useRail()
  const shared = {
    'data-part': 'rail-row',
    'data-active': isActive,
    ...(isActive ? { 'aria-current': 'page' as const } : {}),
    ...(ariaLabel === undefined ? {} : { 'aria-label': ariaLabel }),
    ...(testId === undefined ? {} : { 'data-testid': testId }),
    className: cn(row({ isActive, folded }), className),
  }

  const drawn =
    href === undefined ? (
      <AriaButton {...shared} {...(onPress === undefined ? {} : { onPress })}>
        {children}
      </AriaButton>
    ) : (
      <AriaLink {...shared} href={href}>
        {children}
      </AriaLink>
    )

  if (tooltip === undefined || !folded) return drawn
  return (
    <TooltipTrigger>
      {drawn}
      <Tooltip placement="right">{tooltip}</Tooltip>
    </TooltipTrigger>
  )
}

/** A count at a row's right edge. Not drawn while folded, where it would sit on the glyph. */
export function RailCount({ className, ...props }: React.ComponentProps<'span'>) {
  const { folded } = useRail()
  if (folded) return null
  return (
    <span
      data-part="rail-count"
      className={cn(
        'pointer-events-none absolute top-1.5 right-1 flex h-5 min-w-5 items-center justify-center',
        'rounded-md px-1 text-xs font-medium tabular-nums text-rail-ink',
        className,
      )}
      {...props}
    />
  )
}

/** The nested list under a row. Not drawn while folded. */
export function RailSubList({ className, ...props }: React.ComponentProps<'ul'>) {
  const { folded } = useRail()
  if (folded) return null
  return (
    <ul
      data-part="rail-sublist"
      className={cn(
        'mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-rail-border px-2.5 py-0.5',
        className,
      )}
      {...props}
    />
  )
}

export function RailSubItem({ className, ...props }: React.ComponentProps<'li'>) {
  return <li data-part="rail-subitem" className={cn('relative', className)} {...props} />
}

export interface RailSwitcherProps extends Omit<AriaButtonProps, 'children'> {
  /** The mark at the row's head: an icon, an avatar, a swatch. */
  mark?: ReactNode
  /** The first line: what is being switched. */
  label: ReactNode
  /** The second line, under the label. */
  caption?: ReactNode
  /** Read while the rail is folded, where neither line is. */
  tooltip?: string
}

/**
 * The full-width row at the head or the foot that opens a menu: the case or
 * install switcher, the signed-in analyst.
 *
 * A React Aria `Button`, so it is the trigger a kit `MenuTrigger` wraps.
 * Folded it is the mark alone in a square, with `tooltip` carrying the name.
 */
export function RailSwitcher({
  mark,
  label,
  caption,
  tooltip,
  className,
  ...props
}: RailSwitcherProps) {
  const { folded } = useRail()

  const button = (
    <AriaButton
      data-part="rail-switcher"
      {...props}
      className={composeRenderProps(className, (resolved) =>
        cn(
          row({ folded }),
          'h-(--control-h-lg) aria-expanded:bg-rail-highlight aria-expanded:text-on-rail-highlight',
          resolved,
        ),
      )}
    >
      {mark !== undefined && (
        <span
          className={cn(
            'flex shrink-0 items-center justify-center rounded-md',
            // A near-neutral tile, never `primary`: the mark carries the brand
            // hue itself. Folded there is no tile, and the box matches the mark.
            folded ? 'size-5' : 'size-8 bg-rail-highlight',
          )}
        >
          {mark}
        </span>
      )}
      {!folded && (
        <>
          <span className="flex min-w-0 flex-1 flex-col text-left leading-tight">
            <span className="truncate text-sm font-medium">{label}</span>
            {caption !== undefined && (
              <span className="truncate text-xs text-rail-ink-muted">{caption}</span>
            )}
          </span>
          <ChevronsUpDown aria-hidden className="ml-auto size-4 shrink-0 text-rail-ink-muted" />
        </>
      )}
    </AriaButton>
  )

  if (tooltip === undefined || !folded) return button
  return (
    <TooltipTrigger>
      {button}
      <Tooltip placement="right">{tooltip}</Tooltip>
    </TooltipTrigger>
  )
}
