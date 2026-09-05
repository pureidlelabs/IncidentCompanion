import { createContext, useContext, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Where a table's selection actions are drawn, decided by the screen rather
 * than by the table.
 */
const SlotContext = createContext<HTMLElement | null>(null)

export function SelectionSlotProvider({
  children,
  container,
}: {
  children: ReactNode
  container: HTMLElement | null
}) {
  return <SlotContext value={container}>{children}</SlotContext>
}

/** The node to portal into, and a ref callback for the screen that hosts it. */
export function useSelectionSlotHost(): [HTMLElement | null, (node: HTMLElement | null) => void] {
  // State, not a ref: the children render before the host's ref is attached,
  // and a ref would not re-render them once it is.
  const [node, setNode] = useState<HTMLElement | null>(null)
  return [node, setNode]
}

export function SelectionActions({ children, count }: { children: ReactNode; count: number }) {
  const slot = useContext(SlotContext)
  if (count === 0) return null
  // No count here: `BulkActionBar` already renders "N selected", and two of
  // them in one row is what the continuity tests caught.
  const body = <div className="flex items-center gap-2">{children}</div>
  return slot ? createPortal(body, slot) : body
}
