import { Check, ChevronRight } from 'lucide-react'
import { motion } from 'motion/react'
import { createContext, useContext, useId, type ReactNode } from 'react'
import {
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  Header,
  Keyboard,
  MenuSection,
  MenuTrigger,
  Separator as AriaSeparator,
  SubmenuTrigger,
  composeRenderProps,
  type MenuItemProps as AriaMenuItemProps,
  type MenuProps as AriaMenuProps,
  type MenuSectionProps,
} from 'react-aria-components'
import { tv } from 'tailwind-variants'

import { spring } from '@/lib/motion'

import { MENU_SURFACE, Popover } from './popover'

/**
 * A menu of actions. Wrap a trigger and this in `MenuTrigger`.
 *
 * Rows fire on `onAction`, on the menu or per item. An item with `href`
 * navigates and renders an anchor.
 */
const menu = tv({
  base: 'max-h-[inherit] min-w-32 scroll-py-1 overflow-auto p-1 outline-hidden',
})

const item = tv({
  base: [
    'group relative flex cursor-default select-none items-center gap-1.5 rounded-md',
    'px-1.5 py-1 text-sm outline-hidden forced-color-adjust-none',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4',
    'no-underline [&[href]]:cursor-pointer',
  ],
  variants: {
    isFocused: { true: 'text-on-accent' },
    isDisabled: { true: 'pointer-events-none opacity-50' },
    /** Destructive rows take the tone only once focused, so a menu is not a wall of red. */
    tone: { default: '', destructive: 'text-destructive [&_svg]:text-destructive' },
    /** Aligns a row carrying no icon with the rows beside it that do. */
    inset: { true: 'ps-7', false: '' },
  },
  compoundVariants: [
    // A tinted ground rather than a filled one: the row keeps its own colour,
    // which is what stops a focused destructive row reading as the primary.
    { tone: 'destructive', isFocused: true, class: 'text-destructive' },
  ],
  defaultVariants: { tone: 'default', inset: false },
})

/**
 * The focused row's ground, drawn as one element that travels between rows.
 *
 * **A shared `layoutId`, not a class on each row.** The ground is a single
 * element as far as Motion is concerned, so moving focus animates it from the
 * row it was on to the row it is on -- and the travel is what tells the eye
 * which way the selection went, which a ground that blinks from one row to
 * another cannot.
 */
const ground = tv({
  base: 'absolute inset-0 rounded-md',
  variants: {
    tone: { default: 'bg-accent', destructive: 'bg-destructive/10 dark:bg-destructive/20' },
  },
  defaultVariants: { tone: 'default' },
})

/**
 * The `layoutId` every row in one menu shares.
 *
 * Per menu instance rather than per module: two open menus -- a menu and its
 * submenu -- sharing an id would fly the ground between the two surfaces.
 * `undefined` outside a kit `Menu`, where the ground simply fades.
 */
const MenuGroundContext = createContext<string | undefined>(undefined)

export function Menu<T extends object>(props: AriaMenuProps<T>) {
  const layoutId = useId()
  return (
    <Popover className={`min-w-(--trigger-width) ${MENU_SURFACE}`}>
      <MenuGroundContext.Provider value={layoutId}>
        <AriaMenu
          {...props}
          className={composeRenderProps(props.className, (resolved) =>
            menu({ className: resolved }),
          )}
        />
      </MenuGroundContext.Provider>
    </Popover>
  )
}

export interface MenuItemLook {
  /** `destructive` marks a row that removes something. */
  tone?: 'default' | 'destructive'
  /**
   * Where a selected row shows it. `trailing` is a tick in the right gutter;
   * `check` and `dot` put the mark on the left, which is what a checkbox row
   * and a radio row read as.
   */
  indicator?: 'trailing' | 'check' | 'dot'
  /** Pad a row with no icon so its label lines up with the rows that have one. */
  inset?: boolean
}

export interface MenuItemProps extends AriaMenuItemProps, MenuItemLook {}

export function MenuItem({ tone, indicator = 'trailing', inset, ...props }: MenuItemProps) {
  const textValue =
    props.textValue ?? (typeof props.children === 'string' ? props.children : undefined)
  const leads = indicator !== 'trailing'
  const layoutId = useContext(MenuGroundContext)
  return (
    <AriaMenuItem
      {...props}
      {...(textValue === undefined ? {} : { textValue })}
      className={composeRenderProps(props.className, (resolved, renderProps) =>
        item({ ...renderProps, tone, inset, className: resolved }),
      )}
    >
      {composeRenderProps(
        props.children,
        (children, { selectionMode, isSelected, hasSubmenu, isFocused }) => (
          <>
            {isFocused && (
              <motion.span
                aria-hidden
                {...(layoutId === undefined ? {} : { layoutId })}
                transition={spring.indicator}
                className={ground({ tone })}
              />
            )}
            {leads && (
              <span className="pointer-events-none relative flex size-4 shrink-0 items-center justify-center">
                {isSelected &&
                  (indicator === 'check' ? (
                    <Check aria-hidden className="size-4" />
                  ) : (
                    <span aria-hidden className="size-2 rounded-full bg-current" />
                  ))}
              </span>
            )}
            <span
              className={`relative flex flex-1 items-center gap-2 truncate ${selectionMode === 'none' || leads ? '' : 'pr-6'}`}
            >
              {children}
            </span>
            {!leads && selectionMode !== 'none' && isSelected && (
              <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
                <Check aria-hidden className="size-4" />
              </span>
            )}
            {hasSubmenu && <ChevronRight aria-hidden className="relative size-4 shrink-0" />}
          </>
        ),
      )}
    </AriaMenuItem>
  )
}

/**
 * A row that turns something on and off. The tick sits on the left.
 *
 * The parent has to carry `selectionMode="multiple"` - on the `Menu`, or on
 * the `MenuSectionGroup` when only that run of rows is selectable.
 */
export function MenuCheckboxItem(props: Omit<MenuItemProps, 'indicator'>) {
  return <MenuItem {...props} indicator="check" />
}

/**
 * A row in a run where one is chosen. The dot sits on the left.
 *
 * The parent has to carry `selectionMode="single"`, usually on a
 * `MenuSectionGroup` so the choice is scoped to that run.
 */
export function MenuRadioItem(props: Omit<MenuItemProps, 'indicator'>) {
  return <MenuItem {...props} indicator="dot" />
}

/**
 * A titled run of rows.
 *
 * Takes `selectionMode` and the selection props, which is how a run of
 * checkbox or radio rows is scoped to the section rather than to the whole
 * menu.
 */
export function MenuSectionGroup<T extends object>({
  title,
  ...props
}: MenuSectionProps<T> & { title?: string }) {
  return (
    <MenuSection {...props}>
      {title !== undefined && (
        <Header className="px-1.5 py-1 text-xs font-medium text-ink-muted">
          {title}
        </Header>
      )}
      {props.children as ReactNode}
    </MenuSection>
  )
}

/**
 * A heading over rows that are not in a section. Not focusable.
 *
 * A `MenuSectionGroup` titles its own rows; this is for a caption at the top
 * of a menu, such as the thing the rows act on.
 */
export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <Header className="px-1.5 py-1 text-xs font-medium text-ink-muted">{children}</Header>
  )
}

/** A rule between two runs of rows. Not focusable, and it takes no key. */
export function MenuSeparator() {
  return <AriaSeparator className="-mx-1 my-1 h-px shrink-0 border-none bg-border" />
}

/** The shortcut for a row, right-aligned. Display only. */
export function MenuShortcut({ children }: { children: ReactNode }) {
  return (
    <Keyboard className="ml-auto pl-4 text-xs tracking-widest text-ink-muted group-focus:text-on-accent">
      {children}
    </Keyboard>
  )
}

/**
 * Trailing content on a row that is not a shortcut - a count, the value a
 * setting currently holds, a status word.
 */
export function MenuItemDetail({ children }: { children: ReactNode }) {
  return (
    <span className="ml-auto pl-4 text-xs text-ink-muted group-focus:text-on-accent">
      {children}
    </span>
  )
}

export { MenuTrigger, SubmenuTrigger, item as menuItemVariants }
