import type { ComponentProps } from 'react'
import { tv } from 'tailwind-variants'

import { cn } from '@/lib/cn'

/**
 * A dense list row: media, a title and a description, and an action slot.
 */
const item = tv({
  base: [
    'group/item flex w-full flex-wrap items-center rounded-lg border text-sm outline-none',
    'transition-colors duration-(--duration-fast)',
  ],
  variants: {
    variant: {
      default: 'border-transparent bg-transparent',
      outline: 'border-border bg-card',
      muted: 'border-transparent bg-muted/50',
    },
    // Two rungs, because there were only ever two: `sm` carried the same
    // string as `default`, so a caller asking for the denser row got the
    // normal one and found out by measuring.
    size: {
      default: 'gap-2.5 px-3 py-2.5',
      xs: 'gap-2 px-2.5 py-2',
    },
  },
  defaultVariants: { variant: 'default', size: 'default' },
})

// Spelled out rather than derived from `VariantProps`: react-docgen-typescript
// cannot follow a generated type, and the props vanish from the docs page.
export interface ItemLook {
  /** Ground and rule. `outline` is the card-like row. */
  variant?: 'default' | 'outline' | 'muted'
  /** Padding and gap. `xs` is the tightest row the kit draws. */
  size?: 'default' | 'xs'
}

export interface ItemProps extends ComponentProps<'div'>, ItemLook {}

/** One row. Compose it from `ItemMedia`, `ItemContent` and `ItemActions`. */
export function Item({ variant, size, className, ...props }: ItemProps) {
  return (
    <div
      data-slot="item"
      {...props}
      data-size={size ?? 'default'}
      className={item({ variant, size, className })}
    />
  )
}

export type ItemGroupProps = ComponentProps<'div'>

/** A stack of rows, announced as a list. */
export function ItemGroup({ className, ...props }: ItemGroupProps) {
  return (
    <div
      data-slot="item-group"
      role="list"
      {...props}
      className={cn(
        'group/item-group flex w-full flex-col gap-4',
        'has-data-[size=sm]:gap-2.5 has-data-[size=xs]:gap-2',
        className,
      )}
    />
  )
}

/** The leading glyph, tile or picture. */
const itemMedia = tv({
  base: [
    'flex shrink-0 items-center justify-center gap-2 [&_svg]:pointer-events-none',
    'group-has-data-[slot=item-description]/item:translate-y-0.5',
    'group-has-data-[slot=item-description]/item:self-start',
  ],
  variants: {
    variant: {
      default: 'bg-transparent text-ink-muted',
      icon: 'text-ink-muted [&_svg:not([class*=size-])]:size-4',
      image: [
        'size-10 overflow-hidden rounded-sm [&_img]:size-full [&_img]:object-cover',
        'group-data-[size=sm]/item:size-8 group-data-[size=xs]/item:size-6',
      ],
    },
  },
  defaultVariants: { variant: 'default' },
})

export interface ItemMediaLook {
  /** What the slot holds: a bare glyph, a tiled glyph, or a picture. */
  variant?: 'default' | 'icon' | 'image'
}

export interface ItemMediaProps extends ComponentProps<'div'>, ItemMediaLook {}

/** The media slot, at the row's leading edge. */
export function ItemMedia({ variant, className, ...props }: ItemMediaProps) {
  return (
    <div
      data-slot="item-media"
      {...props}
      data-variant={variant ?? 'default'}
      className={itemMedia({ variant, className })}
    />
  )
}

/** The text column. A second one beside it does not stretch. */
export function ItemContent({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="item-content"
      {...props}
      className={cn(
        'flex flex-1 flex-col gap-1 group-data-[size=xs]/item:gap-0',
        '[&+[data-slot=item-content]]:flex-none',
        className,
      )}
    />
  )
}

/** The row's name, clipped to one line. */
export function ItemTitle({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="item-title"
      {...props}
      className={cn(
        'line-clamp-1 flex w-fit items-center gap-2 text-sm leading-snug font-medium',
        className,
      )}
    />
  )
}

/** What follows the name, clipped to two lines. */
export function ItemDescription({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      data-slot="item-description"
      {...props}
      className={cn(
        'line-clamp-2 text-left text-sm leading-normal font-normal text-ink-muted',
        'group-data-[size=xs]/item:text-xs',
        className,
      )}
    />
  )
}

/** The trailing controls. */
export function ItemActions({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="item-actions"
      {...props}
      className={cn('flex shrink-0 items-center gap-2', className)}
    />
  )
}

export { item as itemVariants, itemMedia as itemMediaVariants }
