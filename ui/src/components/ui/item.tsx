import type { ComponentProps } from 'react'

import { cn, tv } from '@/lib/cn'

/**
 * A dense list row: media, a title and a description, and an action slot.
 *
 * The `data-part` attributes are the contract - `blocks.test.ts` reads them to
 * catch a screen re-growing this shape by hand.
 */
const item = tv({
  base: [
    'group/item flex w-full flex-wrap items-center rounded-lg border text-sm outline-none',
    'transition-colors duration-(--duration-fast)',
  ],
  variants: {
    variant: {
      default: 'border-transparent bg-transparent',
      outline: 'border-border bg-surface',
      muted: 'border-transparent bg-muted/50',
    },
    // Two rungs, and a third only earns its place by carrying its own string:
    // a rung resolving to the same classes as another hands a caller asking
    // for the denser row the normal one, and the only way to find out is by
    // measuring.
    //
    // **Declared here and read plainly in the slot**, so the row's size and a
    // caller's own class meet at equal specificity. Only `xs` declares, and
    // the value inherits: a row nested in a denser one is measured by it.
    // -> `a-kit-size-is-not-a-variant.rule.test.ts`
    size: {
      default: 'gap-2.5 px-3 py-2.5',
      xs: 'gap-2 px-2.5 py-2 [--item-content-gap:0px] [--item-media:1.5rem]',
    },
  },
  defaultVariants: { variant: 'default', size: 'default' },
})

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
      data-part="item"
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
      data-part="item-group"
      role="list"
      {...props}
      className={cn(
        'group/item-group flex w-full flex-col gap-[var(--item-group-gap,1rem)]',
        // **A direct child, and the part and the size on one element.**
        // `has-data-[size=xs]` was an unscoped `:has()`, so anything nested
        // writing `data-size` answered for the group -- and naming the part
        // alone leaves a nested `ItemGroup`'s rows answering for this one.
        // -> #951
        'has-[>[data-part=item][data-size=xs]]:[--item-group-gap:0.5rem]',
        className,
      )}
    />
  )
}

const itemMedia = tv({
  base: [
    'flex shrink-0 items-center justify-center gap-2 [&_svg]:pointer-events-none',
    'group-has-data-[part=item-description]/item:translate-y-0.5',
    'group-has-data-[part=item-description]/item:self-start',
  ],
  variants: {
    variant: {
      default: 'bg-transparent text-ink-muted',
      icon: 'text-ink-muted icon-4',
      image: [
        'size-[var(--item-media,2.5rem)] overflow-hidden rounded-sm',
        '[&_img]:size-full [&_img]:object-cover',
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
      data-part="item-media"
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
      data-part="item-content"
      {...props}
      className={cn(
        'flex flex-1 flex-col gap-[var(--item-content-gap,0.25rem)]',
        '[&+[data-part=item-content]]:flex-none',
        className,
      )}
    />
  )
}

/** The row's name, clipped to one line. */
export function ItemTitle({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-part="item-title"
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
      data-part="item-description"
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
      data-part="item-actions"
      {...props}
      className={cn('flex shrink-0 items-center gap-2', className)}
    />
  )
}

export { item as itemVariants, itemMedia as itemMediaVariants }
