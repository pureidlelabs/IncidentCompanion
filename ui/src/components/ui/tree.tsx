import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  Button as AriaButton,
  Tree as AriaTree,
  TreeItem as AriaTreeItem,
  TreeItemContent as AriaTreeItemContent,
  composeRenderProps,
  type TreeItemProps as AriaTreeItemProps,
  type TreeProps as AriaTreeProps,
} from 'react-aria-components'
import { tv } from 'tailwind-variants'

import { Checkbox } from './checkbox'
import { focusRing } from './rac'

const tree = tv({
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

const treeItem = tv({
  extend: focusRing,
  base: [
    'group relative flex cursor-default items-center gap-1 rounded-md px-2 py-1.5',
    'text-sm transition-colors select-none not-last:pb-0.5 -outline-offset-2',
  ],
  variants: {
    isSelected: {
      false: 'text-ink hover:bg-accent pressed:bg-accent',
      true: [
        'bg-accent text-on-accent hover:bg-accent/80 pressed:bg-accent/80',
        'forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]',
      ],
    },
    isDisabled: {
      true: 'pointer-events-none text-ink-muted opacity-50 forced-colors:text-[GrayText]',
    },
  },
})

/** The expand button. `size-6` rather than a control height: it sits inside a row. */
const treeChevronButton = tv({
  extend: focusRing,
  base: 'flex size-6 shrink-0 cursor-default items-center justify-center rounded-sm border-0 bg-transparent',
})

const treeChevron = tv({
  base: [
    'size-4 text-ink-muted',
    'transition-transform duration-(--duration-fast) ease-(--ease-out)',
    'motion-reduce:transition-none',
  ],
  variants: {
    isExpanded: { true: 'rotate-90' },
  },
})

// Spelled out, not derived from `VariantProps`: react-docgen-typescript
// cannot follow a generated type, and the docs page loses the prop.
export interface TreeLook {
  /** Chrome around the tree. `plain` drops the border, for a tree in a rail. */
  variant?: 'bordered' | 'plain'
}

export interface TreeProps<T extends object> extends AriaTreeProps<T>, TreeLook {}

/**
 * A list whose rows nest.
 */
export function Tree<T extends object>({ variant, ...props }: TreeProps<T>) {
  return (
    <AriaTree
      data-slot="tree"
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        tree({ ...renderProps, variant, className }),
      )}
    />
  )
}

export interface TreeItemProps<T extends object = object>
  extends Omit<AriaTreeItemProps<T>, 'children' | 'textValue'> {
  /** The row's label, and its `textValue`. */
  title: string
  /** Nested `TreeItem`s, or nothing for a leaf. */
  children?: ReactNode
}

/**
 * One row, and the branch under it.
 */
export function TreeItem<T extends object = object>({
  title,
  children,
  ...props
}: TreeItemProps<T>) {
  return (
    <AriaTreeItem
      data-slot="tree-item"
      {...props}
      textValue={title}
      className={composeRenderProps(props.className, (className, renderProps) =>
        treeItem({ ...renderProps, className }),
      )}
    >
      <AriaTreeItemContent>
        {({ selectionMode, selectionBehavior, hasChildItems, isExpanded }) => (
          <>
            {/* **The mode, not the behaviour.** `selectionBehavior` defaults
                to `toggle`, so a guard on it alone drew a checkbox on every row
                of a single-select tree -- four boxes of which one could ever be
                ticked. A checkbox is a control for adding a row to a set, and
                `single` has no set to add to. `GridListItem` guards the same
                way, so the two collections behave alike under the same props. */}
            {selectionMode === 'multiple' && selectionBehavior === 'toggle' ? (
              <Checkbox slot="selection" />
            ) : null}
            <span
              aria-hidden
              className="shrink-0 w-[calc((var(--tree-item-level)_-_1)_*_1rem)]"
            />
            {hasChildItems ? (
              <AriaButton slot="chevron" className={treeChevronButton()}>
                <ChevronRight aria-hidden className={treeChevron({ isExpanded })} />
              </AriaButton>
            ) : (
              <span aria-hidden className="size-6 shrink-0" />
            )}
            <span className="min-w-0 flex-1 truncate">{title}</span>
          </>
        )}
      </AriaTreeItemContent>
      {children}
    </AriaTreeItem>
  )
}

export { tree as treeVariants, treeItem as treeItemVariants }
