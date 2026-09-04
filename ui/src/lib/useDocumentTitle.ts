import { useEffect } from 'react'

/** What the tab reads when a screen names nothing. */
const PRODUCT = 'IncidentCompanion'

/**
 * Names the browser tab after what is on screen.
 *
 * Two cases open in two tabs are told apart by the tab strip, the window
 * switcher and a bookmark, none of which the application can reach any other
 * way. WCAG 2.4.2 asks for it as well, at level A.
 *
 * The product goes last, so the part that differs survives a truncated tab.
 */
export function useDocumentTitle(...parts: readonly (string | undefined)[]): void {
  const title = [...parts.filter((one) => one !== undefined && one.trim() !== ''), PRODUCT].join(
    ' \u00B7 ',
  )
  useEffect(() => {
    document.title = title
    // Restored rather than left behind: a screen that unmounts has stopped
    // being what the tab is showing.
    return () => {
      document.title = PRODUCT
    }
  }, [title])
}
