import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  Button as AriaButton,
  Disclosure as AriaDisclosure,
  DisclosureGroup as AriaDisclosureGroup,
  DisclosurePanel as AriaDisclosurePanel,
  Heading,
  composeRenderProps,
  type DisclosureGroupProps as AriaDisclosureGroupProps,
  type DisclosurePanelProps as AriaDisclosurePanelProps,
  type DisclosureProps as AriaDisclosureProps,
} from 'react-aria-components'
import { tv, type VariantProps } from 'tailwind-variants'

import { focusRing } from './rac'

/**
 * A collapsible section, over React Aria. `DisclosureGroup` stacks several of
 * them, which is what an accordion is.
 *
 * **One component covers both jobs.** A lone `Disclosure` is a collapsible; a
 * `DisclosureGroup` around several is an accordion, and `allowsMultipleExpanded`
 * decides whether more than one may stand open. There is no second primitive
 * to keep in step.
 *
 * **The panel stays in the DOM.** React Aria sets `hidden="until-found"` on it
 * rather than unmounting, so a browser find-in-page reaches collapsed content
 * and expands the section around it. Anything expensive inside a panel renders
 * whether or not the analyst has opened it.
 *
 * **`isExpanded` / `defaultExpanded`, not `open`.** Inside a group the state
 * moves to `expandedKeys` on the group and each `Disclosure` needs an `id` that
 * matches - a `Disclosure` with no `id` in a group cannot be addressed.
 */
const disclosure = tv({
  base: 'group/disclosure w-full text-ink',
  variants: {
    variant: {
      plain: '',
      bordered: 'rounded-lg border border-border bg-card',
    },
    isDisabled: { true: 'opacity-50' },
  },
  defaultVariants: { variant: 'plain' },
})

/**
 * The trigger's chrome. Full width and left-aligned, because the heading it
 * sits in is a section title rather than a control in a row.
 */
const disclosureTrigger = tv({
  extend: focusRing,
  base: [
    'flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left',
    'h-control-lg text-sm font-medium select-none',
    'transition-colors hover:underline',
    '-outline-offset-2',
  ],
  variants: {
    /** A render-prop variant rather than a `disabled:` utility, so the same
     * styling reaches the header row and not only the button carrying the
     * attribute. Measured: the trigger does take the native `disabled`, so it
     * is unreachable by keyboard -- `disclosure.stories.tsx` pins that. */
    isDisabled: { true: 'pointer-events-none text-ink-muted opacity-50' },
  },
})

/** The chevron turns from the root's `data-expanded`, so nothing reads state. */
const disclosureChevron = tv({
  base: [
    'size-4 shrink-0 text-ink-muted',
    'transition-transform duration-(--duration-fast) ease-out',
    'group-data-[expanded]/disclosure:rotate-90',
    'motion-reduce:transition-none',
  ],
})

/**
 * The fold, and it is a CSS transition rather than a Motion animation on
 * purpose.
 *
 * React Aria drives this itself: `useDisclosure` writes the panel's measured
 * `scrollHeight` into `--disclosure-panel-height`, sets it to `0px`, and then
 * **waits on `panel.getAnimations()` before it puts `hidden="until-found"`
 * back**. That wait is the whole reason find-in-page survives an animated
 * fold - the panel is still in the accessibility tree and still findable until
 * the height has finished travelling.
 *
 * `getAnimations()` is what the wait reads, and it returns CSS transitions and
 * Web Animations. A Motion height animation is neither: it runs off Motion's
 * own frame loop and registers nothing on the element, so `getAnimations()`
 * comes back empty, `Promise.all([])` resolves on the next microtask, and
 * `hidden` lands one tick after the press - which is the naive height
 * animation destroying find-in-page, one layer down from where it looks like
 * it would.
 *
 * So the height is transitioned off the variable React Aria is already
 * animating, at the app's own duration and curve.
 */
const disclosurePanel = tv({
  base: [
    'overflow-hidden text-sm text-ink',
    'h-[var(--disclosure-panel-height,auto)]',
    'transition-[height] duration-(--duration-slow) ease-out',
    'motion-reduce:transition-none',
  ],
})

const disclosureGroup = tv({
  base: 'w-full',
  variants: {
    variant: {
      plain: 'divide-y divide-border',
      bordered: 'divide-y divide-border overflow-hidden rounded-lg border border-border bg-card',
    },
    isDisabled: { true: 'opacity-50' },
  },
  defaultVariants: { variant: 'plain' },
})

/** The look, without React Aria's state - those come from the render props. */
type DisclosureLook = Pick<VariantProps<typeof disclosure>, 'variant'>

export interface DisclosureProps extends AriaDisclosureProps, DisclosureLook {
  children: ReactNode
}

export function Disclosure({ variant, children, ...props }: DisclosureProps) {
  return (
    <AriaDisclosure
      data-slot="disclosure"
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        disclosure({ ...renderProps, variant, className }),
      )}
    >
      {children}
    </AriaDisclosure>
  )
}

export interface DisclosureHeaderProps {
  children: ReactNode
  /**
   * Which heading level the section sits at. Defaults to 3, which is right
   * under a pane head; raise or lower it to match the page around it rather
   * than leaving a hole in the outline.
   */
  level?: number
  className?: string
}

/**
 * The heading and its trigger, in one.
 *
 * The button carries `slot="trigger"`, which is how React Aria hands it the
 * press handler and `aria-expanded`. A plain button here looks identical and
 * does nothing.
 */
export function DisclosureHeader({ children, level = 3, className }: DisclosureHeaderProps) {
  return (
    <Heading level={level} className="m-0">
      <AriaButton
        slot="trigger"
        data-slot="disclosure-trigger"
        className={composeRenderProps(className, (resolved, renderProps) =>
          disclosureTrigger({ ...renderProps, className: resolved }),
        )}
      >
        <ChevronRight aria-hidden className={disclosureChevron()} />
        <span className="min-w-0 flex-1 truncate">{children}</span>
      </AriaButton>
    </Heading>
  )
}

export interface DisclosurePanelProps extends AriaDisclosurePanelProps {
  children: ReactNode
}

export function DisclosurePanel({ children, ...props }: DisclosurePanelProps) {
  return (
    <AriaDisclosurePanel
      data-slot="disclosure-panel"
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        disclosurePanel({ ...renderProps, className }),
      )}
    >
      <div className="px-2 pt-0 pb-2.5">{children}</div>
    </AriaDisclosurePanel>
  )
}

/** The look, without React Aria's state. */
type DisclosureGroupLook = Pick<VariantProps<typeof disclosureGroup>, 'variant'>

export interface DisclosureGroupProps extends AriaDisclosureGroupProps, DisclosureGroupLook {
  children: ReactNode
}

/**
 * Several disclosures as one accordion.
 *
 * Every child needs an `id`, and the group addresses them through
 * `expandedKeys` / `defaultExpandedKeys`. One section stands open at a time
 * unless `allowsMultipleExpanded` is set.
 */
export function DisclosureGroup({ variant, children, ...props }: DisclosureGroupProps) {
  return (
    <AriaDisclosureGroup
      data-slot="disclosure-group"
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        disclosureGroup({ ...renderProps, variant, className }),
      )}
    >
      {children}
    </AriaDisclosureGroup>
  )
}

export { disclosure as disclosureVariants, disclosureGroup as disclosureGroupVariants }
