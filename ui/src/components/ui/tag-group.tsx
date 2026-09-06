import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  Tag as AriaTag,
  TagGroup as AriaTagGroup,
  Button,
  TagList,
  Text,
  composeRenderProps,
  type TagGroupProps as AriaTagGroupProps,
  type TagListProps,
  type TagProps as AriaTagProps,
} from 'react-aria-components'
import { tv } from 'tailwind-variants'

import { cn } from '@/lib/cn'
import { focusRing } from './rac'
import { Description, Label } from './field'

/** One tag. `isSelected` is the group's selection, not a state the tag holds. */
const tag = tv({
  extend: focusRing,
  base: [
    'flex h-5 max-w-fit cursor-default items-center gap-1 overflow-hidden rounded-4xl',
    'border border-transparent px-2 py-0.5 text-2xs font-medium transition-[color,background-color,border-color,box-shadow]',
  ],
  variants: {
    variant: {
      default: 'border-border bg-background text-ink',
      muted: 'bg-secondary text-on-secondary',
      destructive: 'bg-destructive/10 text-destructive dark:bg-destructive/20',
    },
    allowsRemoving: { true: 'pe-1' },
    isSelected: {
      true: 'border-transparent bg-primary text-on-primary forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]',
    },
    isDisabled: { true: 'opacity-50 forced-colors:text-[GrayText]' },
  },
  defaultVariants: { variant: 'default' },
})

/**
 * The remove button. Inherits the tag's ink, so it works in every variant.
 *
 * **The box stays 16px and only the mark shrinks.** The button is transparent
 * until hovered, so its size is a target rather than something drawn -- pulling
 * the glyph in makes the cross read lighter against a 20px tag without taking
 * anything off what there is to click.
 *
 * **16px clears WCAG 2.5.8 on spacing, not on size.** The criterion exempts a
 * target whose 24px circle meets no other target's, and adjacent crosses
 * measure 97 and 102px apart. Growing the hit area is also not available from
 * here: the chip is 20px tall and clips its overflow, so a pseudo-element
 * reaches sideways and is cut off above and below.
 */
const remove = tv({
  extend: focusRing,
  base: 'flex size-4 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-[inherit] -outline-offset-2 transition-colors hover:bg-ink/10 pressed:bg-ink/20',
})

export interface TagLook {
  /** Visual role. `destructive` marks a tag whose removal is the point. */
  variant?: 'default' | 'muted' | 'destructive'
}

export interface TagGroupProps<T>
  extends Omit<AriaTagGroupProps, 'children'>,
    Pick<TagListProps<T>, 'items' | 'children' | 'renderEmptyState'> {
  /** The name of the set, above the tags. Without one, pass `aria-label`. */
  label?: string | undefined
  /** One line under the tags. */
  description?: string | undefined
  /** Shown when validation refuses the selection. */
  errorMessage?: string | undefined
}

/**
 * A list of tags, navigable with the arrow keys.
 *
 * Give `onRemove` to let the analyst delete one with Backspace or its own
 * button; `selectionMode` to make the set selectable. The rows are `Tag`
 * children, or `items` plus a render function.
 */
export function TagGroup<T extends object>({
  label,
  description,
  errorMessage,
  items,
  children,
  renderEmptyState,
  className,
  ...props
}: TagGroupProps<T>) {
  return (
    <AriaTagGroup
      data-slot="tag-group"
      {...props}
      className={cn('flex flex-col gap-1.5', className)}
    >
      {label === undefined ? null : <Label>{label}</Label>}
      <TagList
        {...(items === undefined ? {} : { items })}
        {...(renderEmptyState === undefined ? {} : { renderEmptyState })}
        className="flex flex-wrap gap-1.5"
      >
        {children}
      </TagList>
      {description === undefined ? null : <Description>{description}</Description>}
      {errorMessage === undefined ? null : (
        <Text slot="errorMessage" className="text-xs text-destructive">
          {errorMessage}
        </Text>
      )}
    </AriaTagGroup>
  )
}

export interface TagProps extends AriaTagProps, TagLook {
  /** The tag's own text. A non-string needs `textValue` beside it. */
  children?: ReactNode
}

/** One tag in a `TagGroup`. Grows its own remove button when the group takes `onRemove`. */
export function Tag({ variant, children, ...props }: TagProps) {
  const textValue = typeof children === 'string' ? children : undefined
  return (
    <AriaTag
      data-slot="tag"
      {...(textValue === undefined ? {} : { textValue })}
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        tag({ ...renderProps, variant, className }),
      )}
    >
      {composeRenderProps(children, (resolved, { allowsRemoving }) => (
        <>
          {resolved}
          {allowsRemoving && (
            <Button
              slot="remove"
              className={(renderProps) => remove(renderProps)}
            >
              <X aria-hidden className="size-2.5" />
            </Button>
          )}
        </>
      ))}
    </AriaTag>
  )
}
