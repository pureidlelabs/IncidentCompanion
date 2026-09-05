import {
  Link as AriaLink,
  composeRenderProps,
  type LinkProps as AriaLinkProps,
} from 'react-aria-components'
import { tv } from 'tailwind-variants'

import { focusRing } from './rac'

const link = tv({
  extend: focusRing,
  base: [
    'cursor-pointer rounded-sm underline underline-offset-3',
    'transition-colors outline-offset-2',
  ],
  variants: {
    variant: {
      default: 'text-primary hover:text-primary/80',
      muted: 'text-ink-muted hover:text-ink',
      destructive: 'text-destructive hover:text-destructive/80',
      /**
       * A name that happens to navigate: body ink, and the rule only under the
       * pointer.
       */
      quiet: 'text-ink no-underline hover:underline',
    },
    /**
     * The box grows to the 24px target floor and a negative margin takes the
     * growth straight back out of the layout, so the text does not move and
     * the row keeps its height.
     */
    standalone: { true: '-my-1 py-1' },
    isDisabled: {
      true: 'pointer-events-none no-underline opacity-50 forced-colors:text-[GrayText]',
    },
  },
  defaultVariants: { variant: 'default' },
})

export interface LinkLook {
  /**
   * Ink. `muted` is for a link inside secondary text, such as a breadcrumb;
   * `quiet` for one whose text is content rather than an offer of a route.
   */
  variant?: 'default' | 'muted' | 'destructive' | 'quiet'
  /**
   * The link is a control on its own rather than a word inside a sentence.
   */
  standalone?: boolean | undefined
}

export interface LinkProps extends AriaLinkProps, LinkLook {}

/**
 * A text link.
 */
export function Link({ variant, standalone, ...props }: LinkProps) {
  return (
    <AriaLink
      data-slot="link"
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        link({ ...renderProps, variant, standalone, className }),
      )}
    />
  )
}

export { link as linkVariants }
