import { useId } from 'react'

/**
 * The product's mark, inline rather than an `<img>`.
 */
export function Mark({
  className,
  tone = 'brand',
}: {
  className?: string
  /**
   * `brand` sets the mark's own two tokens.
   */
  tone?: 'brand' | 'inherit'
}) {
  const fade = `${useId()}-fade`
  const ink = tone === 'inherit' ? 'text-current' : 'text-ink'
  const beat = tone === 'inherit' ? 'text-current' : 'text-primary'

  return (
    <svg
      viewBox="0 0 512 512"
      className={className}
      data-slot="product-mark"
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

      <g className={ink} stroke="currentColor" fill="none">
        <circle cx="220.5" cy="220.5" r="168.9" strokeWidth="34" />
        <path d="M343.5 343.5 L390.2 390.2" strokeWidth="34" />
        <path d="M385.6 385.6 L452.1 452.1" strokeWidth="50" strokeLinecap="round" />
      </g>

      <g className={beat} mask={`url(#${fade}-mask)`}>
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
