import type { ReactNode } from 'react'
import { Separator as AriaSeparator, type SeparatorProps as AriaSeparatorProps } from 'react-aria-components'
import { tv, type VariantProps } from 'tailwind-variants'

import { cn } from '@/lib/cn'

/**
 * A rule between two groups of content, over React Aria.
 */
const separator = tv({
  base: 'shrink-0 border-none bg-border forced-colors:bg-[ButtonBorder]',
  variants: {
    orientation: {
      horizontal: 'h-px w-full',
      vertical: 'min-h-4 w-px self-stretch',
    },
    /** How much air the rule takes with it, on the axis it divides. */
    spacing: {
      none: '',
      sm: '',
      md: '',
    },
  },
  compoundVariants: [
    { orientation: 'horizontal', spacing: 'sm', class: 'my-1' },
    { orientation: 'horizontal', spacing: 'md', class: 'my-2' },
    { orientation: 'vertical', spacing: 'sm', class: 'mx-1' },
    { orientation: 'vertical', spacing: 'md', class: 'mx-2' },
  ],
  defaultVariants: { orientation: 'horizontal', spacing: 'none' },
})

/** The look this component adds on top of React Aria's own `orientation`. */
type SeparatorLook = Pick<VariantProps<typeof separator>, 'spacing'>

export interface SeparatorProps extends AriaSeparatorProps, SeparatorLook {}

export function Separator({ spacing, className, ...props }: SeparatorProps) {
  return (
    <AriaSeparator
      data-slot="separator"
      {...props}
      className={separator({ orientation: props.orientation ?? 'horizontal', spacing, className })}
    />
  )
}

export interface LabelledSeparatorProps extends SeparatorLook {
  /** The word over the rule -- `or`, `and`. */
  children: ReactNode
  className?: string | undefined
}

/**
 * A rule with a word set into it.
 */
export function LabelledSeparator({ children, spacing, className }: LabelledSeparatorProps) {
  return (
    <div
      data-slot="labelled-separator"
      className={cn('flex w-full items-center gap-3', className)}
    >
      <Separator spacing={spacing} className="flex-1" />
      <span className="shrink-0 text-xs text-ink-muted">{children}</span>
      <Separator spacing={spacing} className="flex-1" />
    </div>
  )
}

export { separator as separatorVariants }
