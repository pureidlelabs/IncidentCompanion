import { motion } from 'motion/react'
import { createContext, use, useId } from 'react'
import {
  GridList as AriaGridList,
  GridListItem as AriaGridListItem,
  composeRenderProps,
  type GridListItemProps as AriaGridListItemProps,
  type GridListProps as AriaGridListProps,
} from 'react-aria-components'
import { tv } from 'tailwind-variants'

import { spring } from '@/lib/motion'

import { Checkbox } from './checkbox'
import { focusRing } from './rac'

const gridList = tv({
  extend: focusRing,
  base: 'relative flex flex-col overflow-auto outline-offset-0',
  variants: {
    variant: {
      bordered: 'rounded-lg border border-border bg-background',
      plain: '',
    },
    isEmpty: { true: 'items-center justify-center p-4 text-sm text-ink-muted' },
  },
  defaultVariants: { variant: 'bordered' },
})

const gridListItem = tv({
  extend: focusRing,
  base: [
    'group relative flex cursor-default items-center gap-2 px-3 py-2',
    'border-t border-border text-sm transition-colors select-none first:border-t-0',
    '-outline-offset-2',
  ],
  variants: {
    isSelected: {
      false: 'text-ink hover:bg-muted/40 pressed:bg-muted/60',
      true: [
        'bg-muted hover:bg-muted/80 pressed:bg-muted/80',
        'forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]',
      ],
    },
    isDisabled: {
      true: 'pointer-events-none text-ink-muted opacity-50 forced-colors:text-[GrayText]',
    },
  },
})

export interface GridListLook {
  /** Chrome around the list. `plain` drops the border and the rounding. */
  variant?: 'bordered' | 'plain'
}

/**
 * One id per `GridList`, so the rail is shared down a list and never between
 * two of them.
 */
const GridListMotionContext = createContext<string | null>(null)

export interface GridListProps<T extends object> extends AriaGridListProps<T>, GridListLook {}

/**
 * A list whose rows may hold their own controls.
 */
export function GridList<T extends object>({ variant, ...props }: GridListProps<T>) {
  const motionId = useId()
  return (
    <GridListMotionContext value={motionId}>
      <AriaGridList
        data-slot="grid-list"
        {...props}
        className={composeRenderProps(props.className, (className, renderProps) =>
          gridList({ ...renderProps, variant, className }),
        )}
      />
    </GridListMotionContext>
  )
}

export type GridListItemProps<T extends object = object> = AriaGridListItemProps<T>

/**
 * One row. Its `id` is the key the selection is reported by.
 */
export function GridListItem<T extends object = object>({
  children,
  ...props
}: GridListItemProps<T>) {
  const ownId = useId()
  const railId = `${use(GridListMotionContext) ?? ownId}-rail`
  const textValue =
    props.textValue ?? (typeof children === 'string' ? children : undefined)
  return (
    <AriaGridListItem
      data-slot="grid-list-item"
      {...props}
      {...(textValue === undefined ? {} : { textValue })}
      className={composeRenderProps(props.className, (className, renderProps) =>
        gridListItem({ ...renderProps, className }),
      )}
    >
      {composeRenderProps(
        children,
        (resolved, { selectionMode, selectionBehavior, isSelected }) => (
          <>
            {selectionMode === 'single' && isSelected && (
              <motion.span
                aria-hidden
                data-slot="grid-list-item-rail"
                layoutId={railId}
                transition={spring.indicator}
                className={[
                  'pointer-events-none absolute inset-y-0 start-0 w-0.5',
                  'bg-primary forced-colors:bg-[Highlight]',
                ].join(' ')}
              />
            )}
            {selectionMode === 'multiple' && selectionBehavior === 'toggle' ? (
              <Checkbox slot="selection" />
            ) : null}
            {resolved}
          </>
        ),
      )}
    </AriaGridListItem>
  )
}

export { gridList as gridListVariants, gridListItem as gridListItemVariants }
