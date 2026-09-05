import { useEffect } from 'react'

/** What the tab reads when a screen names nothing. */
const PRODUCT = 'IncidentCompanion'

/**
 * Names the browser tab after what is on screen.
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
