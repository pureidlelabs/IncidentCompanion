import type { ComponentProps } from 'react'
import { tv } from 'tailwind-variants'

import { cn } from '@/lib/cn'

/** A bordered surface holding one subject. */
const card = tv({
  base: [
    'group/card flex flex-col overflow-hidden rounded-lg text-sm',
    'bg-card text-card-foreground ring-1 ring-ink/10',
    'gap-(--card-spacing) py-(--card-spacing)',
    'has-data-[slot=card-footer]:pb-0',
  ],
  variants: {
    variant: {
      default: '',
      muted: 'bg-muted',
      ghost: 'bg-transparent ring-0',
    },
    elevation: {
      none: '',
      sm: 'shadow-sm',
      md: 'shadow-md',
    },
    padding: {
      none: '[--card-spacing:0px]',
      sm: '[--card-spacing:--spacing(3)]',
      md: '[--card-spacing:--spacing(4)]',
    },
  },
  defaultVariants: { variant: 'default', elevation: 'none', padding: 'md' },
})

// Spelled out rather than derived from `VariantProps`: react-docgen-typescript
// cannot follow a generated type, and the props vanish from the docs page.
export interface CardLook {
  /** Ground. `ghost` draws neither border nor fill. */
  variant?: 'default' | 'muted' | 'ghost'
  /** Shadow, from the token layer's three steps. */
  elevation?: 'none' | 'sm' | 'md'
  /** Vertical rhythm between the card's own sections. */
  padding?: 'none' | 'sm' | 'md'
}

export interface CardProps extends ComponentProps<'div'>, CardLook {}

/** The card itself. Its children supply the horizontal padding. */
export function Card({ variant, elevation, padding, className, ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      {...props}
      data-size={padding === 'sm' ? 'sm' : 'default'}
      className={card({ variant, elevation, padding, className })}
    />
  )
}

/** The title row, plus whatever sits beside it. */
export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      {...props}
      className={cn('flex flex-col gap-1 rounded-t-lg px-(--card-spacing)', className)}
    />
  )
}

/** The card's name. Renders a `div`, so pick the heading level around it. */
export function CardTitle({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      {...props}
      className={cn(
        'text-base leading-snug font-medium group-data-[size=sm]/card:text-sm',
        className,
      )}
    />
  )
}

/** One line under the title. */
export function CardDescription({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      {...props}
      className={cn('text-sm text-ink-muted', className)}
    />
  )
}

/** The body. */
export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-content"
      {...props}
      className={cn('px-(--card-spacing) text-sm', className)}
    />
  )
}

/** The action row, at the foot. */
export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      {...props}
      className={cn(
        'flex items-center gap-2 rounded-b-lg border-t border-border bg-muted/50 p-(--card-spacing)',
        className,
      )}
    />
  )
}

export { card as cardVariants }
