import type { ComponentProps } from 'react'
import { tv } from 'tailwind-variants'

import { cn } from '@/lib/cn'

/**
 * A standing message about the surface it sits on.
 *
 * Carries `role="alert"`, so a screen reader announces it when it appears.
 * The tones are the app's own colour roles: `warning` is the severity ramp's
 * middle step, `success` the containment action class.
 */
const alert = tv({
  base: [
    'group/alert relative grid w-full gap-0.5 rounded-lg border border-border px-2.5 py-2 text-left text-sm',
    'has-[>svg]:gap-x-2',
    // **The action takes a column, declared only where there is one.** A fixed
    // band is overhung by a `sm` button, and whether that shows depends on
    // where the description happens to wrap - right in every screenshot and
    // wrong one word later. The `has-` selectors are what let the column be
    // conditional.
    'has-[>svg]:grid-cols-[auto_1fr]',
    'has-data-[slot=alert-action]:grid-cols-[1fr_auto]',
    '[&:has(>svg):has([data-slot=alert-action])]:grid-cols-[auto_1fr_auto]',
    '[&>svg]:row-span-2 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:translate-y-0.5 [&>svg]:text-current',
  ],
  variants: {
    variant: {
      default: 'bg-card text-card-foreground',
      destructive:
        'bg-card text-destructive *:data-[slot=alert-description]:text-destructive/90',
      warning:
        'bg-card text-severity-medium *:data-[slot=alert-description]:text-severity-medium/90',
      info: 'bg-card text-severity-info *:data-[slot=alert-description]:text-severity-info/90',
      success:
        'bg-card text-action-contain *:data-[slot=alert-description]:text-action-contain/90',
    },
  },
  defaultVariants: { variant: 'default' },
})

export interface AlertLook {
  /** Tone, from the app's colour roles. */
  variant?: 'default' | 'destructive' | 'warning' | 'info' | 'success'
}

export interface AlertProps extends ComponentProps<'div'>, AlertLook {}

/** The alert. Put an icon first, then `AlertTitle` and `AlertDescription`. */
export function Alert({ variant, className, ...props }: AlertProps) {
  return <div data-slot="alert" role="alert" {...props} className={alert({ variant, className })} />
}

/** One line saying what happened. */
export function AlertTitle({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-title"
      {...props}
      className={cn('font-medium group-has-[>svg]/alert:col-start-2', className)}
    />
  )
}

/** What follows from it, and what to do. */
export function AlertDescription({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      {...props}
      className={cn(
        'text-sm text-balance text-ink-muted group-has-[>svg]/alert:col-start-2',
        className,
      )}
    />
  )
}

/**
 * The controls, in the trailing column.
 *
 * `col-end-[-1]` rather than a number: the column it lands in is the last one
 * whether or not the alert drew a media column, so the action does not have to
 * know what else is present.
 */
export function AlertAction({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-action"
      {...props}
      className={cn(
        'col-end-[-1] row-span-2 row-start-1 flex items-center gap-2 self-start',
        className,
      )}
    />
  )
}

export { alert as alertVariants }
