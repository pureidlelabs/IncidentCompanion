import type { ReactNode } from 'react'
import { Separator as AriaSeparator, type SeparatorProps as AriaSeparatorProps } from 'react-aria-components'
import { tv, type VariantProps } from 'tailwind-variants'

import { cn } from '@/lib/cn'

/**
 * A rule between two groups of content, over React Aria.
 *
 * **`className` is a plain string here and nothing else.** React Aria gives
 * `Separator` no render props - it has no state to report - so this is the one
 * component in the kit that cannot take a function, and `composeRenderProps`
 * would not type-check against it. The merge is `tv`'s own.
 *
 * **Decorative or not is a real decision.** A separator announces itself to a
 * screen reader; a rule drawn only to break up a block should be a bordered
 * element instead, not a separator with the announcement suppressed.
 *
 * **A vertical separator needs a height from its parent.** It is a zero-height
 * box otherwise, so `min-h-4` is the floor rather than the size - a flex row
 * with `items-stretch` gives it the row's height.
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
 *
 * The rule is two `Separator`s either side of the label rather than one behind
 * it: a single rule showing through the gaps in the glyphs is what a
 * background-coloured label is patching over, and it only patches over a
 * ground it can name.
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
