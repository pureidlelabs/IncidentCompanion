import { GripVertical } from 'lucide-react'
import { motion, type MotionProps } from 'motion/react'
import { createContext, use, type ComponentType } from 'react'
import {
  Button,
  DropIndicator,
  composeRenderProps,
  useDragAndDrop,
  type DragAndDropOptions,
  type DropIndicatorProps,
  type Key,
} from 'react-aria-components'
import { tv } from 'tailwind-variants'

import { spring, type MotionCollidingProps } from '@/lib/motion'

import { GridList, GridListItem, type GridListItemProps, type GridListProps } from './grid-list'
import { focusRing } from './rac'

/**
 * A list whose rows an analyst can reorder, by pointer or by keyboard.
 *
 * Built on `GridList` and React Aria's own drag and drop. The list holds no
 * order of its own: `onReorder` reports the move and the caller rewrites its
 * data. Rows are `SortableItem`, each of which draws the grip.
 *
 * Keyboard: Tab to a row's grip, Enter to pick it up, the arrow keys to choose
 * a place, Enter to drop, Escape to cancel. A pointer drags the row rather than
 * the grip, which React Aria renders with `pointer-events: none`.
 */
const grip = tv({
  extend: focusRing,
  base: [
    // `size-6 -m-0.5`: 24px whose 20px place in the row is unchanged. React
    // Aria renders this button with `pointer-events: none` and drags the row
    // itself, so the floor is for a focus ring and for a mark a reader has to
    // recognise -- not for a pointer target. Growing the drawn box instead
    // would take the gutter and the row's height with it.
    'inline-flex size-6 -m-0.5 shrink-0 cursor-grab items-center justify-center rounded-sm',
    'text-ink-muted transition-opacity duration-(--duration-fast)',
    'hover:text-ink dragging:cursor-grabbing',
  ],
  variants: {
    handle: {
      always: '',
      // `opacity`, not `hidden`: a hidden control takes no focus, and the
      // keyboard route into the drag runs through this button.
      hover: 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 dragging:opacity-100',
    },
  },
  defaultVariants: { handle: 'hover' },
})

const dropIndicator = tv({
  base: 'z-10 -my-px h-0.5 w-full outline-hidden',
  variants: {
    isDropTarget: {
      false: 'bg-transparent',
      true: 'bg-primary forced-colors:bg-[Highlight]',
    },
  },
})

export interface SortableLook {
  /** When the grip shows. `hover` fades it in on the row's hover or focus. */
  handle?: 'always' | 'hover'
}

/**
 * The list's `handle` choice, read by every row under it. A row's own `handle`
 * wins; without this a list-level setting could not reach a collection item,
 * which React Aria renders outside the caller's tree.
 */
const HandleContext = createContext<SortableLook['handle']>(undefined)

export interface SortableProps<T extends object>
  extends Omit<GridListProps<T>, 'dragAndDropHooks'>,
    SortableLook {
  /** Commit a move. `e.target` names the row and whether the drop fell before or after it. */
  onReorder: NonNullable<DragAndDropOptions<T>['onReorder']>
  /** The plain text a dragged row carries to another drop target. Defaults to its key. */
  getItemText?: (key: Key) => string
  /** Turn dragging off while leaving the rows selectable. */
  isDragDisabled?: boolean
}

export function Sortable<T extends object>({
  onReorder,
  getItemText,
  isDragDisabled,
  handle,
  ...props
}: SortableProps<T>) {
  const { dragAndDropHooks } = useDragAndDrop<T>({
    getItems: (keys) =>
      [...keys].map((key) => ({ 'text/plain': getItemText?.(key) ?? String(key) })),
    onReorder,
    renderDropIndicator: (dropTarget) => <SortableDropIndicator target={dropTarget} />,
    ...(isDragDisabled === undefined ? {} : { isDisabled: isDragDisabled }),
  })
  return (
    <HandleContext value={handle}>
      <GridList {...props} dragAndDropHooks={dragAndDropHooks} />
    </HandleContext>
  )
}

/**
 * The row, wrapped so Motion owns its box.
 *
 * Created once at module scope: `motion.create()` inside a render builds a new
 * component type on every pass, which remounts every row and loses the
 * animation it was made for. `MotionCollidingProps` names the props React Aria
 * and Motion both declare.
 *
 * **The drag mechanism is untouched.** React Aria still owns the pointer, the
 * keyboard route and the drop indicator; what this adds is what happens
 * *after* `onReorder` - the caller rewrites its data, the rows render at new
 * indices, and `layout` measures the move and springs each row from where it
 * was to where it now is instead of the list cutting to the new order.
 */
// `children` is omitted from both halves and taken back from React Aria: the
// two declare it as different things - a render prop against a `MotionValue` -
// and an intersection of the two is a type nothing satisfies.
//
// `onHoverStart` / `onHoverEnd` collide the other way and are dropped from
// *Motion*: both libraries declare them, and it is React Aria's pair a caller
// wants on a row - Motion's fire on a raw pointer event, where React Aria's
// suppress the ones a touch drag produces.
type MotionRowProps = Omit<GridListItemProps, 'children' | MotionCollidingProps> &
  Omit<MotionProps, 'children' | 'onHoverStart' | 'onHoverEnd'> &
  Pick<GridListItemProps, 'children'>

const MotionGridListItem = motion.create(GridListItem) as unknown as ComponentType<MotionRowProps>

export interface SortableItemProps<T extends object = object>
  extends GridListItemProps<T>,
    SortableLook {}

/**
 * One reorderable row. Its `id` is the key `onReorder` reports.
 *
 * Draws the grip in the row's leading gutter; React Aria names it after the
 * row, so a row whose children are not a plain string needs a `textValue`.
 */
export function SortableItem<T extends object = object>({
  handle,
  children,
  ...props
}: SortableItemProps<T>) {
  const inherited = use(HandleContext)
  const textValue = props.textValue ?? (typeof children === 'string' ? children : undefined)
  return (
    <MotionGridListItem
      {...(props as Omit<GridListItemProps, 'children' | MotionCollidingProps>)}
      {...(textValue === undefined ? {} : { textValue })}
      layout
      transition={spring.reorder}
    >
      {composeRenderProps(children, (resolved) => (
        <>
          {/* No `aria-label` here: React Aria names the drag button after the
              row's own text, and an explicit label would win and say less. */}
          <Button slot="drag" className={grip({ handle: handle ?? inherited })}>
            <GripVertical aria-hidden className="size-3.5" />
          </Button>
          <span className="flex min-w-0 flex-1 items-center gap-2">{resolved}</span>
        </>
      ))}
    </MotionGridListItem>
  )
}

export type SortableDropIndicatorProps = DropIndicatorProps

/** The line drawn between two rows at the place a drop would land. */
export function SortableDropIndicator(props: SortableDropIndicatorProps) {
  return (
    <DropIndicator
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        dropIndicator({ ...renderProps, className }),
      )}
    />
  )
}

export { grip as sortableGripVariants, dropIndicator as sortableDropIndicatorVariants }
