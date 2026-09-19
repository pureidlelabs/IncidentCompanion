import type { ComponentProps, ReactNode } from 'react'

import { cn, tv } from '@/lib/cn'

const plate = tv({
  base: 'relative flex min-w-0 flex-col border border-border',
  variants: {
    radius: {
      sm: 'rounded-sm [--plate-radius:var(--radius-sm)]',
      md: 'rounded-md [--plate-radius:var(--radius-md)]',
      lg: 'rounded-lg [--plate-radius:var(--radius-lg)]',
    },
    tone: {
      surface: 'bg-surface',
      muted: 'bg-muted/60',
      none: '',
    },
    /**
     * **The corner is the radius less the border**, so the cut lands inside
     * the stroke rather than across it, the way `--table-corner` does.
     */
    clip: {
      true: '[--plate-corner:calc(var(--plate-radius)-1px)]',
      false: '[--plate-corner:0px]',
    },
  },
  defaultVariants: { radius: 'sm', tone: 'none', clip: true },
})

/** The look this component takes. Spelled out so the docs generator can read it. */
export interface PlateLook {
  /** The corner the plate draws, and the one its content is cut to. */
  radius?: 'sm' | 'md' | 'lg'
  /** The plate's own ground. `none` leaves it to whatever it sits on. */
  tone?: 'surface' | 'muted' | 'none'
  /**
   * Whether the content is cut to the corner. Pass `false` where a child has
   * to reach outside the box -- a sticky head, a focus ring, a menu.
   */
  clip?: boolean
}

export interface PlateProps extends Omit<ComponentProps<'div'>, 'children'>, PlateLook {
  children: ReactNode
  /** Classes for the inner box that carries the cut, rather than for the plate. */
  contentClassName?: string
}

/**
 * A bordered box whose content is cut to its own corner.
 *
 * A child with its own ground and square corners paints over the arc the
 * radius removes. Each box that met this answered it separately, so the answer
 * lives here once: the plate draws the border and declares the corner, and one
 * box inside it carries the cut.
 *
 * - **The cut is on the content, not on the plate.** `clip-path` on the plate
 *   would cut its own border in half at every edge, and `overflow` there makes
 *   it the scrollport any sticky child sticks to. `table.tsx` settled the same
 *   question the same way.
 * - `clip={false}` takes the corner to `0px` rather than removing the box, so
 *   a child that has to escape still sits in the same tree.
 *
 * The browser tier is what can see whether the paint stops at the arc:
 * `probe.js` reports it as `paints-past-the-corner`.
 */
export function Plate({
  radius,
  tone,
  clip,
  className,
  contentClassName,
  children,
  ...props
}: PlateProps) {
  return (
    <div data-part="plate" {...props} className={cn(plate({ radius, tone, clip }), className)}>
      <div
        data-part="plate-content"
        className={cn(
          'flex min-w-0 flex-1 flex-col [clip-path:inset(0_round_var(--plate-corner))]',
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  )
}

export { plate as plateStyles }
