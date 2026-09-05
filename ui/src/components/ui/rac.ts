import { composeRenderProps } from 'react-aria-components'
import { tv } from 'tailwind-variants'

import { cn } from '@/lib/cn'

/**
 * The kit's focus ring. Extend it with `tv`'s `extend`.
 */
export const focusRing = tv({
  base: 'outline-ring/60 outline-offset-2 forced-colors:outline-[Highlight]',
  variants: {
    isFocusVisible: {
      false: 'outline-0',
      true: 'outline-2',
    },
  },
})

/**
 * Merge a caller's `className` over `own`, accepting a string or a render-prop
 * function and returning whichever React Aria wants.
 */
export function composeClassName<T>(
  className: string | ((values: T & { defaultClassName?: string | undefined }) => string) | undefined,
  own: string,
): string | ((values: T & { defaultClassName?: string | undefined }) => string) {
  return composeRenderProps(className, (resolved) => cn(own, resolved))
}
