import { ChevronDown, ChevronRight, MoreHorizontal, Pencil, Pin, PinOff, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Menu, MenuTrigger } from '@/components/ui/menu'
import { Toolbar } from '@/components/ui/toolbar'
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/cn'

/**
 * The controls at the end of a row: pin, expand, edit, delete, overflow.
 *
 * - A `Toolbar`, so the cluster is one tab stop with arrow keys inside it.
 * - The cluster is revealed on hover, on `:focus-visible`, and while the row
 *   is expanded or selected.
 * - `heldBy` refuses edit and delete and names the analyst holding the row,
 *   through a tooltip on the control that is refusing.
 * - `menu` takes kit `MenuItem` children; React Aria reads them as a
 *   collection rather than as markup.
 * - `onMenuOpenChange` makes the overflow a controlled trigger, so the row
 *   itself can open it. Passing it also holds the cluster on screen for as
 *   long as the menu is: the popover is anchored to the overflow button, and
 *   a menu hanging off a control at `opacity: 0` points at nothing.
 */
export function RowActions({
  label,
  expanded,
  onToggleExpanded,
  onEdit,
  editDisabled,
  heldBy,
  onDelete,
  pinned,
  onTogglePin,
  menu,
  menuOpen,
  onMenuOpenChange,
  className,
}: {
  /** What the row is called, for every control's accessible name. */
  label: string
  /** Whether the row's detail is open. */
  expanded?: boolean | undefined
  onToggleExpanded?: (() => void) | undefined
  onEdit?: (() => void) | undefined
  /** An optimistic row has no server id to PATCH yet. */
  editDisabled?: boolean | undefined
  /** Another analyst has this row open. Their name, or absent. */
  heldBy?: string | undefined
  onDelete?: (() => void) | undefined
  /** Whether this row is pinned, where the screen has pins at all. */
  pinned?: boolean | undefined
  onTogglePin?: (() => void) | undefined
  /** The overflow's rows. Absent draws no overflow button. */
  menu?: ReactNode | undefined
  /** Whether the overflow is open. Read only alongside `onMenuOpenChange`. */
  menuOpen?: boolean | undefined
  /** Present makes the overflow controlled; absent leaves it React Aria's. */
  onMenuOpenChange?: ((open: boolean) => void) | undefined
  className?: string | undefined
}) {
  // `icon-xs` is `size-6` around a `size-4` glyph, which clears the 24px
  // target floor `visual-check` holds every control to.
  const icon = 'text-ink-muted hover:text-ink'
  return (
    <Toolbar
      data-slot="row-actions"
      aria-label={`Actions for ${label}`}
      className={cn(
        'justify-end gap-0.5 transition-opacity',
        'has-[:focus-visible]:opacity-100 group-hover:opacity-100 group-hover/row:opacity-100',
        'group-data-[state=selected]/row:opacity-100',
        expanded === true || menuOpen === true ? 'opacity-100' : 'opacity-0',
        className,
      )}
    >
      {onTogglePin && (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={pinned ? `Unpin ${label}` : `Pin ${label}`}
          aria-pressed={pinned ?? false}
          onPress={onTogglePin}
          // A pinned row keeps its pin on screen once the rest of the cluster
          // fades, since nothing else says the row is pinned.
          className={cn(icon, pinned && 'text-ink opacity-100')}
        >
          {pinned ? <PinOff className="size-4" aria-hidden /> : <Pin className="size-4" aria-hidden />}
        </Button>
      )}
      {onToggleExpanded && (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-expanded={expanded ?? false}
          aria-label={expanded ? 'Hide detail' : 'Show detail'}
          onPress={onToggleExpanded}
          className={icon}
        >
          {expanded ? (
            <ChevronDown className="size-4" aria-hidden />
          ) : (
            <ChevronRight className="size-4" aria-hidden />
          )}
        </Button>
      )}
      {onEdit && (
        <TooltipTrigger isDisabled={!heldBy}>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Edit ${label} in full`}
            isRefused={(editDisabled ?? false) || Boolean(heldBy)}
            onPress={onEdit}
            className={icon}
          >
            <Pencil className="size-4" aria-hidden />
          </Button>
          {/* `isRefused` keeps the tab stop and the pointer events, so the
              tooltip naming the colleague can still fire on a control that
              will not act. */}
          <Tooltip>{heldBy ? `${heldBy} is editing this` : ''}</Tooltip>
        </TooltipTrigger>
      )}
      {onDelete && (
        <TooltipTrigger isDisabled={!heldBy}>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Delete ${label}`}
            isRefused={Boolean(heldBy)}
            onPress={onDelete}
            className={icon}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
          <Tooltip>{heldBy ? `${heldBy} is editing this` : ''}</Tooltip>
        </TooltipTrigger>
      )}
      {menu && (
        <MenuTrigger
          {...(onMenuOpenChange
            ? { isOpen: menuOpen ?? false, onOpenChange: onMenuOpenChange }
            : {})}
        >
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`More for ${label}`}
            className={icon}
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
          <Menu aria-label={`More for ${label}`}>{menu}</Menu>
        </MenuTrigger>
      )}
    </Toolbar>
  )
}
