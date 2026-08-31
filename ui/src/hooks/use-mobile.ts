import * as React from "react"

const MOBILE_BREAKPOINT = 768

/**
 * Whether the viewport is below the mobile breakpoint, from the first render.
 *
 * Seeded in the initialiser rather than in an effect: callers pick a layout
 * while rendering, so a hook that starts `false` and corrects itself renders
 * the desktop shape once on every narrow viewport.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(() => window.innerWidth < MOBILE_BREAKPOINT)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${String(MOBILE_BREAKPOINT - 1)}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    return () => {
      mql.removeEventListener("change", onChange)
    }
  }, [])

  return isMobile
}
