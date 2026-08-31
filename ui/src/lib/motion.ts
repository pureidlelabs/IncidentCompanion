import type { Transition, Variants } from 'motion/react'

/**
 * The app's motion, over the token layer.
 *
 * **Distances are read through `var()`, not copied.** Motion animates CSS
 * variables, so `--motion-rise` and `--motion-travel` in `tokens.css` are the
 * single source for how far a thing moves, and a design language that wants
 * calmer motion changes them and nothing here.
 * -> https://motion.dev/docs/react-tailwind
 *
 * **Durations are numbers, and that is a real duplication.** A `transition`
 * takes seconds, and nothing can read `--duration-*` from JavaScript at
 * animation time.
 */
export const DURATION = { fast: 0.12, base: 0.18, slow: 0.28 } as const

/** The curve every entry and exit uses. Matches `--ease-out`. */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const

/**
 * The springs, for the motions where a duration is the wrong control.
 *
 * A row settling into a new place in a list and an indicator catching up with
 * the row it marks are both *travel*, and the eye reads a spring's overshoot as
 * weight rather than as an effect. Everything else in this file is a duration,
 * because a fade has no mass.
 *
 * Under `MotionConfig reducedMotion="user"` these are dropped exactly as the
 * durations are - a spring is a `Transition` like any other.
 */
export const spring = {
  /** A row arriving at its new index after a reorder. */
  reorder: { type: 'spring', stiffness: 520, damping: 42, mass: 0.9 },
  /** An indicator travelling to the row it now marks. Stiffer: it leads. */
  indicator: { type: 'spring', stiffness: 620, damping: 44, mass: 0.8 },
  /** A handle inside its own track. Short travel, so it settles hard. */
  control: { type: 'spring', stiffness: 520, damping: 34, mass: 0.6 },
  /**
   * A surface the hand can throw: a sheet dragged off its edge, and the settle
   * when it is let go short of dismissal. A curve cannot end where a throw
   * ends, which is the whole reason a dragged panel needs one of these.
   */
  panel: { type: 'spring', stiffness: 340, damping: 36, mass: 0.9 },
  /** A toast landing, and the ones under it shifting to make room. */
  toast: { type: 'spring', stiffness: 420, damping: 34, mass: 0.7 },
  /**
   * A bar catching up with a value that arrived in one jump - a file at a
   * time, a page at a time. The spring is what turns those steps into one
   * movement. Softer than `control`: a fill travels the width of a bar rather
   * than a handle's throw, and a hard settle there reads as a twitch.
   *
   * Driven through `useSpring` rather than as a variant's `transition`, since
   * the target changes continuously and there is no state to name.
   */
  fill: { type: 'spring', stiffness: 220, damping: 32, mass: 0.6 },
} satisfies Record<string, Transition>

export const transition = {
  /** A colour crossfade, or a control changing state. */
  fast: { duration: DURATION.fast, ease: EASE_OUT },
  /** A small state change carrying a little travel. */
  base: { duration: DURATION.base, ease: EASE_OUT },
  /** Something travelling far enough to be followed by the eye. */
  slow: { duration: DURATION.slow, ease: EASE_OUT },
} satisfies Record<string, Transition>

/**
 * The props React Aria and Motion both declare, with types that do not
 * reconcile under `exactOptionalPropertyTypes`.
 *
 * `style` is a React Aria render prop against Motion's `MotionStyle`; the three
 * DOM animation events collide with Motion's callbacks of the same name; the
 * drag events are the DOM ones against Motion's gesture callbacks. A kit
 * component omits this set from the React Aria side and takes Motion's, which
 * is what makes `drag` usable at all.
 */
export type MotionCollidingProps =
  | 'style'
  | 'onAnimationStart'
  | 'onAnimationEnd'
  | 'onAnimationIteration'
  | 'onDrag'
  | 'onDragStart'
  | 'onDragEnd'

/**
 * What a thing arrives from, chosen by what kind of thing it is.
 *
 * Three classes, and the boundary between them is size rather than taste. A
 * surface is large enough that a few percent is already a visible growth, and
 * anything deeper reads as a zoom rather than an arrival. A glyph is fifteen
 * pixels across, where the same few percent is nothing at all and the eye needs
 * a third of the box to see it move. A mark is drawn rather than revealed:
 * arriving *is* the state change, so it comes from nothing.
 *
 * **The set is closed on purpose.** These were seven numbers across seven
 * files - 0.994, 0.96, 0.94, 0.92, 0.7, 0.6, 0 - each of which looked
 * considered where it stood, because the only place the vocabulary is visible
 * is the whole tree at once. `src/motion-scale.rule.test.ts` is what keeps it
 * at three.
 *
 * A nudge within a percent of 1 is not one of these: a card lifting under the
 * pointer says *this takes a touch* rather than saying where it came from, and
 * it stays a literal beside the gesture that produced it.
 */
export const SCALE = {
  /** A surface: a popover, a dialog, a tooltip, a menu, a sheet. */
  surface: 0.96,
  /** A glyph swapped inside a control: a tick appearing, an icon changing. */
  glyph: 0.65,
  /** A mark drawn rather than revealed: a radio's pip. */
  mark: 0,
} as const

const RISE = 'var(--motion-rise)'
const TRAVEL = 'var(--motion-travel)'

/**
 * An overlay arriving and leaving: a fade, a rise, and a small scale.
 *
 * The scale is `SCALE.surface` rather than lower - a panel growing from small
 * reads as a zoom, and at this size the eye reads it as arriving instead.
 */
export const overlay: Variants = {
  hidden: { opacity: 0, y: `calc(${RISE} * -1)`, scale: SCALE.surface },
  shown: { opacity: 1, y: 0, scale: 1, transition: transition.slow },
  gone: { opacity: 0, y: `calc(${RISE} * -1)`, scale: SCALE.surface, transition: transition.fast },
}

/**
 * The scrim behind a modal surface. A fade, and nothing else.
 *
 * Named states rather than `initial`/`animate` objects, because Motion
 * propagates a variant *name* down its tree - the panel inside takes the same
 * state without being told, so one `isExiting` drives both.
 */
export const scrim: Variants = {
  hidden: { opacity: 0 },
  shown: { opacity: 1, transition: transition.base },
  gone: { opacity: 0, transition: transition.fast },
}

/** A panel sliding in from an edge. `from` is the edge it is anchored to. */
export function slide(from: 'left' | 'right' | 'top' | 'bottom'): Variants {
  // Spelled as two branches rather than a computed key: a computed key widens
  // the object to `Record<string, ...>`, which is not a `Variant`.
  const away = from === 'left' || from === 'top' ? `calc(${TRAVEL} * -1)` : TRAVEL
  if (from === 'left' || from === 'right') {
    return {
      hidden: { opacity: 0, x: away },
      shown: { opacity: 1, x: 0, transition: transition.slow },
      gone: { opacity: 0, x: away, transition: transition.fast },
    }
  }
  return {
    hidden: { opacity: 0, y: away },
    shown: { opacity: 1, y: 0, transition: transition.slow },
    gone: { opacity: 0, y: away, transition: transition.fast },
  }
}

/**
 * A surface arriving from the edge it is anchored to: a popover, a tooltip, a
 * hover card.
 *
 * The claim it makes is *this came from the thing you just touched*, and two
 * halves carry it. The surface travels from the trigger's side, so it moves
 * back towards the anchor as it lands; and it scales from the anchored edge
 * rather than from its own centre, which is what separates a surface being
 * produced from a surface zooming into being. `origin` is that second half,
 * and belongs on the element's `transformOrigin`.
 *
 * `placement` is the *resolved* one - pass `props.placement ?? 'top'` from a
 * tooltip and `?? 'bottom'` from a popover. React Aria's default differs per
 * component, and a shared guess here is a default nobody can see.
 *
 * @param placement Resolved React Aria placement. The alignment suffix is
 *   ignored: `top start` anchors like `top`.
 * @param distance How far it travels. A tooltip takes less than a popover -
 *   it is the most repeated surface in the app, and a long travel on it is a
 *   delay paid a hundred times a shift.
 * @param scale What it grows from. Defaults to `SCALE.surface`; a caller
 *   passing its own is choosing a different class rather than a different
 *   number.
 * @param speed Which entry duration from the shared scale. Exit is always
 *   `fast`: the surface has already been read.
 */
export function anchored(
  placement: string,
  { distance = RISE, scale = SCALE.surface, speed = 'base' }: AnchoredOptions = {},
): { variants: Variants; origin: string } {
  const back = `calc(${distance} * -1)`
  // Spelled as four branches rather than a lookup: a computed key widens the
  // object to `Record<string, ...>`, which is not a `Variant`.
  const side = placement.split(' ')[0]
  const { away, origin } =
    side === 'top'
      ? { away: { y: distance }, origin: 'bottom center' }
      : side === 'left'
        ? { away: { x: distance }, origin: 'right center' }
        : side === 'right'
          ? { away: { x: back }, origin: 'left center' }
          : { away: { y: back }, origin: 'top center' }

  return {
    origin,
    variants: {
      hidden: { opacity: 0, scale, ...away },
      // Both axes, not only the one that moved. React Aria re-places a surface
      // that would overflow the viewport, so an instance built with `x` set can
      // be re-rendered with `y` set - and whichever axis is not zeroed here
      // keeps its `hidden` offset and displaces the surface for good.
      shown: { opacity: 1, scale: 1, x: 0, y: 0, transition: transition[speed] },
      gone: { opacity: 0, scale, ...away, transition: transition.fast },
    },
  }
}

export interface AnchoredOptions {
  /** How far it travels. Defaults to `--motion-rise`. */
  distance?: string
  /** What it grows from. Defaults to 0.96. */
  scale?: number
  /** Which entry duration. Defaults to `base`. */
  speed?: keyof typeof transition
}

/** A row arriving in a list. Pair with `stagger` on the parent. */
export const row: Variants = {
  hidden: { opacity: 0, y: RISE },
  shown: { opacity: 1, y: 0, transition: transition.base },
  gone: { opacity: 0, transition: transition.fast },
}

/**
 * A list handing its rows in one after another.
 *
 * `delayChildren` is zero: the first row should not wait, or a list of one
 * appears to lag.
 */
export const stagger: Variants = {
  shown: { transition: { staggerChildren: 0.05, delayChildren: 0 } },
}

/** A disclosure opening and closing on a measured height. */
export const fold: Variants = {
  hidden: { height: 0, opacity: 0 },
  shown: { height: 'auto', opacity: 1, transition: transition.slow },
  gone: { height: 0, opacity: 0, transition: transition.fast },
}

/**
 * A stroke drawn on rather than faded in, for a tick or a checkmark.
 *
 * Applies to a `motion.path`; `pathLength` is normalised, so one set of values
 * covers any path at any size.
 */
export const draw: Variants = {
  hidden: { pathLength: 0, opacity: 0 },
  shown: { pathLength: 1, opacity: 1, transition: transition.base },
  gone: { pathLength: 0, opacity: 0, transition: transition.fast },
}

/**
 * One state replacing another in the same slot: a badge's content, an icon.
 *
 * The blur is what makes the swap read as one thing changing rather than two
 * things crossfading - the outgoing state stops being legible before it has
 * finished leaving.
 */
export const swap: Variants = {
  hidden: { opacity: 0, y: RISE, filter: 'blur(4px)' },
  shown: { opacity: 1, y: 0, filter: 'blur(0px)', transition: transition.base },
  gone: { opacity: 0, y: `calc(${RISE} * -1)`, filter: 'blur(4px)', transition: transition.fast },
}
