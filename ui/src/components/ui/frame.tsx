import { tv } from 'tailwind-variants'

import { cn } from '@/lib/cn'

/**
 * A bordered card with a tinted header.
 *
 * Compose it as `Frame > FrameHeader (FrameTitle + FrameDescription) +
 * FramePanel`. The header and the panel read their padding from variables
 * `Frame` sets, so `spacing` moves both together.
 */
const frame = tv({
  base: [
    'flex w-full min-w-0 flex-col overflow-hidden rounded-lg',
    '[--frame-px:--spacing(4)] [--frame-py:--spacing(4)] [--frame-header-py:--spacing(2)]',
    // Nested, the radius steps down. Two equal radii inside one another read
    // as a misprint rather than as one card holding another.
    '[[data-slot=frame]_&]:rounded-lg',
  ],
  variants: {
    variant: {
      /**
       * A card on the page ground. Nested, it keeps the border and drops the
       * lift: a shadow inside a shadow reads as a dialog that failed to open.
       */
      default: [
        'border border-border bg-card text-card-foreground shadow-sm',
        '[[data-slot=frame]_&]:shadow-none',
      ],
      /** No border and no lift, for a frame already inside one. */
      ghost: 'bg-transparent',
    },
    spacing: {
      sm: '[--frame-px:--spacing(3)] [--frame-py:--spacing(3.5)] [--frame-header-py:--spacing(1.5)]',
      default: '',
      lg: '[--frame-px:--spacing(5)] [--frame-py:--spacing(5)] [--frame-header-py:--spacing(2.5)]',
    },
  },
  defaultVariants: { variant: 'default', spacing: 'default' },
})

/** The look this component takes. Spelled out so the docs generator can read it. */
export interface FrameLook {
  /** Whether the card draws its own border and lift. */
  variant?: 'default' | 'ghost'
  /** Padding for the header and the panel together. */
  spacing?: 'sm' | 'default' | 'lg'
}

export interface FrameProps extends React.ComponentProps<'div'>, FrameLook {}

export function Frame({ variant, spacing, className, ...props }: FrameProps) {
  return (
    <div
      data-slot="frame"
      data-spacing={spacing ?? 'default'}
      className={cn(frame({ variant, spacing }), className)}
      {...props}
    />
  )
}

/** The tinted band across the top, holding the title and its description. */
export function FrameHeader({ className, ...props }: React.ComponentProps<'header'>) {
  return (
    <header
      data-slot="frame-header"
      className={cn(
        'flex flex-col gap-0.5 border-b border-border bg-muted/50',
        'px-(--frame-px) py-(--frame-header-py)',
        className,
      )}
      {...props}
    />
  )
}

/** The header's name for the card. Renders a `div`, so pick the heading tier at the call site. */
export function FrameTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="frame-title"
      className={cn('text-sm font-semibold text-ink', className)}
      {...props}
    />
  )
}

/** One line under the title, saying what the card holds. */
export function FrameDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="frame-description"
      className={cn('text-xs text-ink-muted', className)}
      {...props}
    />
  )
}

export interface FramePanelLook {
  /**
   * `none` drops the panel's own padding, for a panel whose whole content is
   * another frame or a list that draws its own inset - the two paddings
   * otherwise add up and the nested frame sits in a moat.
   */
  padding?: 'default' | 'none'
}

export interface FramePanelProps extends React.ComponentProps<'div'>, FramePanelLook {}

/** The card's body. More than one stacks with a rule between them. */
export function FramePanel({ padding = 'default', className, ...props }: FramePanelProps) {
  return (
    <div
      data-slot="frame-panel"
      className={cn(
        'min-w-0',
        padding === 'none' ? 'p-0' : 'px-(--frame-px) py-(--frame-py)',
        '[[data-slot=frame-panel]+&]:border-t [[data-slot=frame-panel]+&]:border-border',
        className,
      )}
      {...props}
    />
  )
}

export { frame as frameVariants }
