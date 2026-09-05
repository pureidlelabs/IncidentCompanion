import type { ReactNode } from 'react'
import {
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  ListBoxSection as AriaListBoxSection,
  Collection,
  Header,
  composeRenderProps,
  type ListBoxItemProps as AriaListBoxItemProps,
  type ListBoxProps as AriaListBoxProps,
  type ListBoxSectionProps as AriaListBoxSectionProps,
} from 'react-aria-components'
import { tv } from 'tailwind-variants'

import { focusRing } from './rac'

const listBox = tv({
  extend: focusRing,
  base: 'flex flex-col gap-px scroll-py-1 overflow-auto p-1 outline-offset-0',
  variants: {
    variant: {
      bordered: 'rounded-lg border border-border bg-background',
      plain: '',
    },
    isEmpty: { true: 'items-center justify-center p-4 text-sm text-ink-muted' },
  },
  defaultVariants: { variant: 'bordered' },
})

/**
 * One row. Exported because the menu, the picker and the combo box all build on
 * it rather than growing a second row.
 */
const listBoxItem = tv({
  extend: focusRing,
  base: [
    'group relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1',
    'text-sm transition-colors select-none -outline-offset-2',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4',
  ],
  variants: {
    isSelected: {
      false: 'text-ink hover:bg-accent hover:text-on-accent pressed:bg-accent',
      true: [
        'bg-primary text-on-primary',
        'forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]',
      ],
    },
    isDisabled: {
      true: 'pointer-events-none text-ink-muted opacity-50 forced-colors:text-[GrayText]',
    },
  },
})

export interface ListBoxLook {
  /** Chrome around the list. `plain` drops the border, for a list inside a popover. */
  variant?: 'bordered' | 'plain'
}

export interface ListBoxProps<T extends object> extends AriaListBoxProps<T>, ListBoxLook {}

/**
 * A list of options.
 *
 * Takes `selectedKeys`/`onSelectionChange` with a `selectionMode` of `single`
 * or `multiple`; the default is `none`, which makes the list read-only. Needs
 * a `label` from `aria-label` or `aria-labelledby`.
 */
export function ListBox<T extends object>({ variant, ...props }: ListBoxProps<T>) {
  return (
    <AriaListBox
      data-slot="list-box"
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        listBox({ ...renderProps, variant, className }),
      )}
    />
  )
}

export type ListBoxItemProps<T extends object = object> = AriaListBoxItemProps<T>

/**
 * One option. Its `id` is the key the selection is reported by.
 */
export function ListBoxItem<T extends object = object>(props: ListBoxItemProps<T>) {
  const textValue =
    props.textValue ?? (typeof props.children === 'string' ? props.children : undefined)
  return (
    <AriaListBoxItem
      data-slot="list-box-item"
      {...props}
      {...(textValue === undefined ? {} : { textValue })}
      className={composeRenderProps(props.className, (className, renderProps) =>
        listBoxItem({ ...renderProps, className }),
      )}
    />
  )
}

export interface ListBoxSectionProps<T extends object>
  extends Omit<AriaListBoxSectionProps<T>, 'children'> {
  /** The heading above the group. */
  title?: string
  /** The rows, or a render function when `items` is given. */
  children?: ReactNode | ((item: T) => ReactNode)
  /** The data behind a dynamic group. */
  items?: Iterable<T>
}

/** A titled group of rows. Arrow keys cross the boundary; selection does not care. */
export function ListBoxSection<T extends object>({
  title,
  items,
  children,
  ...props
}: ListBoxSectionProps<T>) {
  return (
    <AriaListBoxSection data-slot="list-box-section" {...props} className="flex flex-col gap-px">
      {title === undefined ? null : (
        <Header className="px-1.5 py-1 text-xs font-medium text-ink-muted">{title}</Header>
      )}
      <Collection {...(items === undefined ? {} : { items })}>{children}</Collection>
    </AriaListBoxSection>
  )
}

export { listBox as listBoxVariants, listBoxItem as listBoxItemVariants }

/**
 * The tones a row may be marked with: the severity ramp, plus the three
 * response actions.
 */
export type ListBoxItemTone =
  | 'critical'
  | 'high'
  | 'medium'
  | 'low'
  | 'info'
  | 'none'
  | 'notify'
  | 'contain'
  | 'investigate'

const TONE_FILL = {
  critical: 'bg-severity-critical',
  high: 'bg-severity-high',
  medium: 'bg-severity-medium',
  low: 'bg-severity-low',
  info: 'bg-severity-info',
  none: 'bg-severity-none',
  notify: 'bg-action-notify',
  contain: 'bg-action-contain',
  investigate: 'bg-action-investigate',
} as const satisfies Record<ListBoxItemTone, string>

// `low` is the one level light enough that the shared foreground fails on it,
// so it carries its own ink. The rest read off `--on-severity`.
const TONE_INK = {
  critical: 'text-on-severity',
  high: 'text-on-severity',
  medium: 'text-on-severity',
  low: 'text-on-severity-low',
  info: 'text-on-severity',
  none: 'text-on-severity',
  notify: 'text-on-severity',
  contain: 'text-on-severity',
  investigate: 'text-on-severity',
} as const satisfies Record<ListBoxItemTone, string>

const itemDot = tv({
  base: 'inline-block shrink-0 rounded-full ring-1 ring-inset ring-border/60',
  variants: {
    size: { sm: 'size-2', md: 'size-2.5' },
  },
  defaultVariants: { size: 'sm' },
})

const itemPill = tv({
  base: [
    'inline-flex h-4 w-fit shrink-0 items-center justify-center gap-1 rounded-full',
    'px-1.5 text-2xs font-medium whitespace-nowrap',
  ],
})

export interface ListBoxItemDotProps {
  /** Which meaning the dot carries. */
  tone: ListBoxItemTone
  /** `md` for a row at the large end of the density ladder. */
  size?: 'sm' | 'md'
  className?: string
}

/**
 * A coloured disc on a row - a severity, a response action, a label colour.
 */
export function ListBoxItemDot({ tone, size, className }: ListBoxItemDotProps) {
  return (
    <span
      aria-hidden
      data-slot="list-box-item-dot"
      className={itemDot({ size, className: [TONE_FILL[tone], className].join(' ') })}
    />
  )
}

export interface ListBoxItemPillProps {
  /** Which meaning the pill carries. */
  tone: ListBoxItemTone
  /** The word inside it. */
  children?: ReactNode
  className?: string
}

/**
 * A filled pill on a row, for when the colour needs a word with it.
 */
export function ListBoxItemPill({ tone, children, className }: ListBoxItemPillProps) {
  return (
    <span
      data-slot="list-box-item-pill"
      className={itemPill({ className: [TONE_FILL[tone], TONE_INK[tone], className].join(' ') })}
    >
      {children}
    </span>
  )
}

export { itemDot as listBoxItemDotVariants, itemPill as listBoxItemPillVariants }
