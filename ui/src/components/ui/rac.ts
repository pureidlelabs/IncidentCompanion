import { composeRenderProps } from 'react-aria-components'
import { tv } from 'tailwind-variants'

import { cn } from '@/lib/cn'

/**
 * The kit's focus ring. Extend it with `tv`'s `extend`.
 *
 * Keyed on React Aria's `isFocusVisible` render prop rather than
 * `:focus-visible`, which is wrong for widgets whose focus sits on a child.
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
 * function and returning whichever React Aria wants. `cn` resolves conflicts,
 * so a caller's `px-3` beats the component's `px-2`.
 */
export function composeClassName<T>(
  className: string | ((values: T & { defaultClassName?: string | undefined }) => string) | undefined,
  own: string,
): string | ((values: T & { defaultClassName?: string | undefined }) => string) {
  return composeRenderProps(className, (resolved) => cn(own, resolved))
}
