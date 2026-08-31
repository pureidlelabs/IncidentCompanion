import type { ReactNode } from 'react'
import { PreviewTrigger, type PreviewTriggerProps } from 'react-aria-components'
import { tv } from 'tailwind-variants'

import { HOVER_CARD_CLOSE_DELAY, HOVER_CARD_OPEN_DELAY } from './hover-card-delays'
import { Popover, type PopoverProps } from './popover'
import { composeClassName } from './rac'

/** The panel's padding and width. The surface itself is the kit's `Popover`. */
const hoverCardPanel = tv({
  base: 'p-2.5 text-sm',
  variants: {
    size: {
      sm: 'w-56',
      default: 'w-64',
      lg: 'w-96',
    },
  },
  defaultVariants: { size: 'default' },
})

export type HoverCardProps = PreviewTriggerProps

/**
 * A preview that opens on hover, on focus and on long press.
 *
 * Takes exactly two children: the trigger, then a `HoverCardPanel`. Unlike a
 * tooltip the panel may hold interactive content. `delay` and `closeDelay`
 * default to the kit's shared hover-card timings.
 */
export function HoverCard({
  delay = HOVER_CARD_OPEN_DELAY,
  closeDelay = HOVER_CARD_CLOSE_DELAY,
  ...props
}: HoverCardProps) {
  return <PreviewTrigger delay={delay} closeDelay={closeDelay} {...props} />
}

// Spelled out, not derived from `VariantProps`: react-docgen-typescript
// cannot follow a generated type, and the docs page loses the prop.
export interface HoverCardPanelLook {
  /** Panel width. `sm` for a name and a line, `lg` for a record summary. */
  size?: 'sm' | 'default' | 'lg'
}

export interface HoverCardPanelProps extends PopoverProps, HoverCardPanelLook {
  /** The preview body. Interactive content is allowed here. */
  children: ReactNode
}

/** The surface a `HoverCard` opens. A `Popover` carrying the preview's padding. */
export function HoverCardPanel({ size, className, ...props }: HoverCardPanelProps) {
  return (
    <Popover
      data-slot="hover-card-panel"
      {...props}
      className={composeClassName(className, hoverCardPanel({ size }))}
    />
  )
}

export { hoverCardPanel as hoverCardPanelStyles }
