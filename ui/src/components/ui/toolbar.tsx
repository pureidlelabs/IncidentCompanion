import {
  Toolbar as AriaToolbar,
  composeRenderProps,
  type ToolbarProps as AriaToolbarProps,
} from 'react-aria-components'
import { tv } from 'tailwind-variants'

/**
 * A row of controls that is one tab stop, over React Aria.
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
 * props.
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
