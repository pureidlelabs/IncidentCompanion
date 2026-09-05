import type { ReactNode } from 'react'
import {
  DropZone as AriaDropZone,
  FileTrigger,
  Text,
  composeRenderProps,
  type DropZoneProps as AriaDropZoneProps,
} from 'react-aria-components'
import { tv } from 'tailwind-variants'

/**
 * The target. A dashed edge, because a solid one reads as a field that has
 * already taken a value.
 */
const zone = tv({
  base: [
    'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed',
    'border-input bg-transparent p-6 text-center text-sm text-ink-muted',
    'outline-none transition-colors dark:bg-input/30',
  ],
  variants: {
    isDropTarget: {
      true: 'border-primary bg-primary/5 text-ink dark:bg-primary/10 forced-colors:border-[Highlight]',
    },
    isFocusVisible: {
      true: 'border-ring ring-3 ring-ring/50 forced-colors:border-[Highlight]',
    },
    isDisabled: { true: 'opacity-50 forced-colors:border-[GrayText]' },
  },
})

export interface DropZoneProps extends Omit<AriaDropZoneProps, 'children'> {
  /**
   * What the zone accepts, and its accessible name. Rendered as the zone's
   * label; without one, pass `aria-label`.
   */
  label?: string | undefined
  /** One line under the label. */
  description?: string | undefined
  /** Anything below the text, typically a `FileTrigger` wrapping a `Button`. */
  children?: ReactNode
}

/**
 * An area files or dragged items are dropped onto.
 */
export function DropZone({ label, description, children, ...props }: DropZoneProps) {
  return (
    <AriaDropZone
      data-slot="drop-zone"
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        zone({ ...renderProps, className }),
      )}
    >
      {label === undefined ? null : (
        <Text slot="label" className="font-medium text-ink">
          {label}
        </Text>
      )}
      {description === undefined ? null : <span className="text-sm">{description}</span>}
      {children}
    </AriaDropZone>
  )
}

/**
 * The keyboard half of a drop zone: a pressable child opens the file picker.
 */
export { FileTrigger }

export { zone as dropZoneVariants }
