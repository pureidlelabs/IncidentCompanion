import { useId } from 'react'

/**
 * The product's mark, inline rather than an `<img>`.
 *
 * **An `<img>` cannot follow the ground switcher.** It is its own document, so
 * it resolves none of the page's variables: `server/assets/logo-light.svg` and
 * `logo-dark.svg` exist as two files precisely because a served mark has to
 * carry its own colours. Inlined, one drawing serves both grounds and
 * re-colours the instant `data-theme` moves. A `prefers-color-scheme` block
 * inside the SVG is the wrong fix for the same problem: it reads the *OS*
 * setting, which the ground switcher does not set, so a dark OS with the app
 * in Light gets the dark mark.
 *
 * **Colour comes from `currentColor` on two groups, not from the tokens named
 * in an attribute.** A `var()` inside a presentation attribute is not CSS and
 * does not resolve; two groups carrying `text-ink` and `text-primary`
 * do, and stay readable as Tailwind.
 *
 * **Those two groups set the colour rather than inheriting it**, so the mark
 * keeps its own ink on any surface. What follows the ground switcher is the
 * tokens, not the placement. A mark on `bg-primary` stays dark ink on mid-blue;
 * a mark that must sit on a coloured panel needs a variant, and there is not
 * one. `Mark`'s stories measure this.
 *
 * **The fade is a mask, not a gradient stroke**, for the same reason: a
 * gradient's stops would have to name the colour, which would put the token
 * back into an attribute. The mask carries only the ramp and lets
 * `currentColor` carry the hue. Its stops are black outside the beat's span,
 * so the gradient's clamp hides the ends rather than painting them.
 *
 * **The ids are per-instance.** Two marks on one page - the picker's rail and
 * anything drawn beside it - would otherwise both resolve `url(#beat)` to the
 * first one in the document.
 *
 * Geometry is duplicated from `server/assets/logo-light.svg`, which is the
 * authority; `mark.test.ts` fails when the two disagree.
 */
export function Mark({ className }: { className?: string }) {
  const fade = `${useId()}-fade`

  return (
    <svg
      viewBox="0 0 512 512"
      className={className}
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient
          id={fade}
          gradientUnits="userSpaceOnUse"
          x1="73.5"
          y1="222.6"
          x2="367.5"
          y2="222.6"
        >
          <stop offset="0" stopColor="#000" />
          <stop offset="0.113" stopColor="#fff" />
          <stop offset="0.908" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </linearGradient>
        <mask id={`${fade}-mask`}>
          <rect x="0" y="0" width="512" height="512" fill={`url(#${fade})`} />
        </mask>
      </defs>

      <g className="text-ink" stroke="currentColor" fill="none">
        <circle cx="220.5" cy="220.5" r="168.9" strokeWidth="34" />
        <path d="M343.5 343.5 L390.2 390.2" strokeWidth="34" />
        <path d="M385.6 385.6 L452.1 452.1" strokeWidth="50" strokeLinecap="round" />
      </g>

      <g className="text-primary" mask={`url(#${fade}-mask)`}>
        <path
          d="M73.5 222.6 H163 L185.6 124.2 L218 302.4 L252.4 191.9 L272.4 239.8 L278 222.6 H367.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="20.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  )
}
