import {
  Toolbar as AriaToolbar,
  composeRenderProps,
  type ToolbarProps as AriaToolbarProps,
} from 'react-aria-components'
import { tv } from 'tailwind-variants'

/**
 * A row of controls that is one tab stop, over React Aria.
 *
 * **The whole row is reached in one Tab and walked with the arrow keys.** That
 * is the only thing this buys over a flex div, and it is the reason a section's
 * action row is a toolbar rather than a row of buttons.
 *
 * **A child has to opt in to the roving focus.** React Aria's toolbar moves
 * focus by walking its own descendants, so a control that manages focus itself
 * - a portalled menu trigger, a nested toolbar - is skipped by the arrow keys
 * while looking identical to its neighbours. Check the keyboard, not the paint.
 *
 * **`orientation` is a render prop as well as a prop.** React Aria reports it
 * back so the row can lay itself out from the same value it announces, which
 * is why the variant reads from the render props rather than from `props`.
 */
const toolbar = tv({
  base: 'flex gap-2',
  variants: {
    orientation: {
      horizontal: 'flex-row flex-wrap items-center',
      vertical: 'w-fit flex-col items-stretch',
    },
    density: {
      default: 'gap-2',
      tight: 'gap-1',
      loose: 'gap-3',
    },
    variant: {
      plain: '',
      /** A banded row: use it where the toolbar sits above content it acts on. */
      banded: 'rounded-lg border border-border bg-muted/50 p-1',
    },
  },
  defaultVariants: { orientation: 'horizontal', density: 'default', variant: 'plain' },
})

/**
 * The look, without React Aria's state - `orientation` comes from the render
 * props. Spelled out rather than derived from `VariantProps`, which
 * `react-docgen-typescript` cannot follow, so the docs page would list neither.
 */
export interface ToolbarLook {
  /** Gap between controls. */
  density?: 'default' | 'tight' | 'loose'
  /** `banded` draws a border and a muted ground, for a row above what it acts on. */
  variant?: 'plain' | 'banded'
}

export interface ToolbarProps extends AriaToolbarProps, ToolbarLook {}

export function Toolbar({ density, variant, ...props }: ToolbarProps) {
  return (
    <AriaToolbar
      data-slot="toolbar"
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        toolbar({ ...renderProps, density, variant, className }),
      )}
    />
  )
}

export { toolbar as toolbarVariants }
