import { tv } from 'tailwind-variants'

import { cn } from '@/lib/cn'

/**
 * The empty state of a list or a pane: a glyph, a title, one line of
 * explanation and the action that fills it.
 *
 * Compose it as `Empty > EmptyMedia + EmptyTitle + EmptyDescription +
 * EmptyActions`. Every part is optional except the title.
 */
const empty = tv({
  base: 'flex w-full min-w-0 flex-col items-center justify-center text-center text-balance',
  variants: {
    size: {
      sm: 'gap-2.5 p-4',
      default: 'gap-4 p-6',
      lg: 'gap-6 p-10',
    },
    /** Whether the block fills the space it is dropped into. */
    inset: {
      true: 'flex-1 rounded-lg border border-dashed border-border',
      false: '',
    },
  },
  defaultVariants: { size: 'default', inset: false },
})

/** The look this component takes. Spelled out so the docs generator can read it. */
export interface EmptyLook {
  /** How much air the block takes. */
  size?: 'sm' | 'default' | 'lg'
  /** Draw a dashed border and grow to fill the container. */
  inset?: boolean
}

export interface EmptyProps extends React.ComponentProps<'div'>, EmptyLook {}

export function Empty({ size, inset, className, ...props }: EmptyProps) {
  return <div data-slot="empty" className={cn(empty({ size, inset }), className)} {...props} />
}

const emptyMedia = tv({
  base: 'mb-2 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0',
  variants: {
    variant: {
      /** A glyph on a tinted square ground. */
      icon: 'size-8 rounded-lg bg-muted text-ink [&_svg:not([class*=size-])]:size-4',
      /** A drawing that brings its own box. */
      illustration: 'text-ink-muted',
    },
  },
  defaultVariants: { variant: 'icon' },
})

/** The look this component takes. Spelled out so the docs generator can read it. */
export interface EmptyMediaLook {
  /** Whether the media is a single glyph on a ground, or artwork of its own. */
  variant?: 'icon' | 'illustration'
}

export interface EmptyMediaProps extends React.ComponentProps<'div'>, EmptyMediaLook {}

/** The glyph or drawing above the title. */
export function EmptyMedia({ variant, className, ...props }: EmptyMediaProps) {
  return (
    <div
      aria-hidden
      data-slot="empty-media"
      data-variant={variant ?? 'icon'}
      className={cn(emptyMedia({ variant }), className)}
      {...props}
    />
  )
}

/** The one line naming what is not there. Renders a `div`, so pick the heading tier at the call site. */
export function EmptyTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="empty-title"
      className={cn('text-sm font-medium tracking-tight text-ink', className)}
      {...props}
    />
  )
}

/** What to do about it, in a sentence. */
export function EmptyDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="empty-description"
      className={cn('max-w-sm text-sm/relaxed text-ink-muted', className)}
      {...props}
    />
  )
}

/** The row of controls that fills the empty state. */
export function EmptyActions({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="empty-actions"
      className={cn('flex w-full max-w-sm flex-wrap items-center justify-center gap-2.5 text-sm', className)}
      {...props}
    />
  )
}

export { empty as emptyVariants, emptyMedia as emptyMediaVariants }
