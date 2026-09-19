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
      false: '',
    },
  },
  defaultVariants: { radius: 'sm', tone: 'none', clip: true },
})

/** The look this component takes. Spelled out so the docs generator can read it. */
export interface PlateLook {
  /**
   * The corner the plate draws, and the one its content is cut to.
   *
   * Set it here rather than with `rounded-*` in `className`: the two travel
   * together, and a class overriding one leaves the other where it was, which
   * is a border arc and a cut arc of different sizes.
   */
  radius?: 'sm' | 'md' | 'lg'
  /** The plate's own ground. `none` leaves it to whatever it sits on. */
  tone?: 'surface' | 'muted' | 'none'
  /**
   * Whether the content is cut to the corner.
   *
   * `false` drops the declaration rather than zeroing it, because
   * `inset(0px round 0px)` still cuts to the border box and still opens a
   * stacking context. Pass it where a child paints outside the box: a sticky
   * head, or a control whose focus ring sits outside its own edge.
   *
   * An overlay React Aria portals out of the tree was never cut and needs
   * nothing here.
   */
  clip?: boolean
}

export interface PlateProps extends Omit<ComponentProps<'div'>, 'children'>, PlateLook {
  children: ReactNode
  /**
   * Classes for the inner box that carries the cut.
   *
   * The plate holds exactly one child, so anything in `className` addressing
   * children -- `divide-y`, `space-y-*`, `gap-*`, `*:`, a sibling selector --
   * reaches the content box and not the content. Those go here.
   */
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
 * - `clip={false}` drops the cut and keeps the box, so a child that has to
 *   escape still sits in the same tree.
 * - **A cut plate cuts a positive outline offset.** The kit's focus ring is
 *   `outline-offset-2`, which paints outside the border box, so a control
 *   flush against the edge loses the outer edge of its ring. `table.tsx`
 *   answers this with `-outline-offset-2` on what it clips, and a caller
 *   putting controls against a plate's edge owes the same.
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
          'flex min-h-0 min-w-0 flex-1 flex-col',
          // **Dropped, not zeroed.** `inset(0px round 0px)` is still a clip to
          // the border box and still opens a stacking context, so a zeroed
          // corner cuts everything a real one does.
          clip === false ? '' : '[clip-path:inset(0_round_var(--plate-corner))]',
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  )
}

export { plate as plateStyles }
