import {
  Tab as AriaTab,
  TabList as AriaTabList,
  TabPanel as AriaTabPanel,
  Tabs as AriaTabs,
  composeRenderProps,
  type TabListProps as AriaTabListProps,
  type TabPanelProps as AriaTabPanelProps,
  type TabProps as AriaTabProps,
  type TabsProps as AriaTabsProps,
} from 'react-aria-components'
import { motion } from 'motion/react'
import { createContext, use, useId, useState } from 'react'
import { tv } from 'tailwind-variants'

import { cn } from '@/lib/cn'
import { transition } from '@/lib/motion'

import { focusRing } from './rac'

const tabs = tv({
  base: 'flex max-w-full',
  variants: {
    orientation: {
      horizontal: 'flex-col gap-4',
      vertical: 'flex-row gap-4',
    },
  },
})

/**
 * The rule under the row is on the list, so it runs the full width.
 *
 * The cross axis is pinned to `hidden`. CSS promotes the other axis to `auto`
 * as soon as one is, and the selected bar sits a pixel outside the box -- which
 * is enough to give a row of three tabs a vertical scrollbar.
 */
const tabList = tv({
  base: 'flex max-w-full',
  variants: {
    orientation: {
      horizontal: 'flex-row gap-1 overflow-x-auto overflow-y-hidden border-b border-border',
      vertical: 'flex-col items-stretch gap-1 overflow-x-hidden border-e border-border',
    },
  },
})

/**
 * The selected tab is marked by a bar on the edge facing the panel, and the bar
 * travels between tabs.
 *
 * The bar is a `motion` element sharing one `layoutId` across the list, so its
 * length and position are measured rather than declared, which is what a moving
 * indicator needs and a declared width cannot give it. Under
 * `MotionConfig reducedMotion="user"` it jumps instead of sliding.
 */
const tab = tv({
  extend: focusRing,
  base: [
    'group relative flex cursor-default items-center justify-center gap-2 border-transparent',
    'whitespace-nowrap transition-colors select-none -outline-offset-2',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4',
    // No negative margin onto the list's rule: the bar is drawn inside the
    // list, and a tab hanging over that edge is clipped by it.
    '[[data-orientation=vertical]_&]:justify-start',
  ],
  variants: {
    size: {
      sm: 'h-(--control-h-md) rounded-sm px-2.5 text-xs',
      default: 'h-(--control-h-lg) rounded-sm px-3 text-sm',
    },
    isSelected: {
      false: 'text-ink-muted hover:text-ink',
      true: 'font-medium text-ink',
    },
    isDisabled: {
      true: 'pointer-events-none text-ink-muted opacity-50 forced-colors:text-[GrayText]',
    },
  },
  defaultVariants: { size: 'default' },
})

const tabPanel = tv({
  extend: focusRing,
  // **A column, not a block.** The panel grows to the room its section
  // gives it, and a block cannot hand that height to what it holds, so a
  // table inside one has nothing to bound its own scrollport against.
  base: 'flex min-h-0 flex-1 flex-col text-sm text-ink outline-offset-2',
})

/**
 * One id per `Tabs`, so the bar and the panel box are *shared*.
 *
 * A `layoutId` is Motion's identity: two elements carrying the same one are
 * treated as one element moving, and two elements carrying different ones are
 * two elements appearing. Minting it inside `Tab` gives every tab its own, so
 * the bar has nothing to travel from and cuts between positions; scoping it to
 * the `Tabs` is what keeps two lists on one page apart without also splitting
 * the tabs of one list.
 */
const TabsMotionContext = createContext<string | null>(null)

export type TabsProps = AriaTabsProps

/**
 * A tabbed pane.
 *
 * Holds `selectedKey`/`onSelectionChange` as the selected tab's `id`.
 * `orientation="vertical"` puts the list beside the panel instead of above it.
 */
export function Tabs(props: TabsProps) {
  const motionId = useId()
  return (
    <TabsMotionContext value={motionId}>
      <AriaTabs
        data-slot="tabs"
        {...props}
        className={composeRenderProps(props.className, (className, renderProps) =>
          tabs({ ...renderProps, className }),
        )}
      />
    </TabsMotionContext>
  )
}

export type TabListProps<T extends object> = AriaTabListProps<T>

/** The row of tabs. One tab stop; the arrow keys move between the tabs. */
export function TabList<T extends object>(props: TabListProps<T>) {
  return (
    <AriaTabList
      data-slot="tab-list"
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        tabList({ ...renderProps, className }),
      )}
    />
  )
}

export interface TabLook {
  /** Height, from the `--control-h-*` scale. */
  size?: 'sm' | 'default'
}

export interface TabProps extends AriaTabProps, TabLook {}

/**
 * One tab. Its `id` names the panel it opens. Disable one with `isDisabled`.
 *
 * The selected bar is rendered by whichever tab is selected; `layoutId` is what
 * makes it look like one bar moving rather than two fading.
 */
export function Tab({ size, ...props }: TabProps) {
  // Scoped per `Tabs`, so two tab lists on one page do not share a bar and fly
  // between each other, and the three tabs of one list do share it.
  const ownId = useId()
  const barId = `${use(TabsMotionContext) ?? ownId}-bar`
  return (
    <AriaTab
      data-slot="tab"
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        tab({ ...renderProps, size, className }),
      )}
    >
      {composeRenderProps(props.children, (children, { isSelected }) => (
        <>
          {children}
          {isSelected && (
            <motion.span
              aria-hidden
              data-slot="tab-bar"
              layoutId={barId}
              transition={transition.base}
              className={cn(
                'absolute bg-primary forced-colors:bg-[Highlight]',
                // Inside the box, not a pixel outside it: the list clips its
                // cross axis to keep a row of tabs from growing a scrollbar,
                // and anything hanging over that edge is clipped with it.
                '[[data-orientation=horizontal]_&]:inset-x-0 [[data-orientation=horizontal]_&]:bottom-0',
                '[[data-orientation=horizontal]_&]:h-0.5',
                '[[data-orientation=vertical]_&]:inset-y-0 [[data-orientation=vertical]_&]:end-0',
                '[[data-orientation=vertical]_&]:w-0.5',
              )}
            />
          )}
        </>
      ))}
    </AriaTab>
  )
}

export interface TabPanelProps extends AriaTabPanelProps {
  /**
   * Swap the content in without the fade and the height travel.
   *
   * For a list that narrows one table rather than switching between panes,
   * where the rows are the same rows filtered and animating them reads as the
   * table reloading.
   */
  still?: boolean
}

/**
 * The content behind one tab. Its `id` matches that tab's `id`.
 *
 * Unmounted while another tab is selected unless `shouldForceMount` is set.
 *
 * The box the content sits in carries the same `layoutId` in every panel, so
 * the panel that arrives measures itself against the one that left and the pane
 * grows or shrinks into its new height rather than jumping. `shouldForceMount`
 * and the exiting panel are both excluded from it: two live elements under one
 * `layoutId` is a collision, not a shared element.
 */
export function TabPanel({ still = false, ...props }: TabPanelProps) {
  const ownId = useId()
  const boxId = `${use(TabsMotionContext) ?? ownId}-panel`
  // Clipping is on only while the box is between two heights. A panel is a
  // pane an analyst works in - it holds popovers, focus rings and sticky heads
  // - and `overflow-hidden` standing permanently would clip all three to pay
  // for an animation that runs for 180ms.
  const [travelling, setTravelling] = useState(false)
  return (
    <AriaTabPanel
      data-slot="tab-panel"
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        tabPanel({ ...renderProps, className }),
      )}
    >
      {composeRenderProps(props.children, (children, { isInert }) =>
        still ? (
          children
        ) : (
          <motion.div
            data-slot="tab-panel-box"
            {...(isInert ? {} : { layoutId: boxId })}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={transition.base}
            onLayoutAnimationStart={() => {
              setTravelling(true)
            }}
            onLayoutAnimationComplete={() => {
              setTravelling(false)
            }}
            style={{ overflow: travelling ? 'hidden' : 'visible' }}
          >
            {children}
          </motion.div>
        ),
      )}
    </AriaTabPanel>
  )
}

export { tabs as tabsVariants, tabList as tabListVariants, tab as tabVariants }
