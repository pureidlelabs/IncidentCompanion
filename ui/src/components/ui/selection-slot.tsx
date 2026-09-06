import { createContext, useContext, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Where a table's selection actions are drawn, decided by the screen rather
 * than by the table.
 *
 * The entities screen owns one filter bar for all seven scopes; the table
 * under it is this screen's own on the unscoped view and one of six section
 * components when scoped. Without a slot the bar can only be rendered beside
 * the table it belongs to - which is where it was, and where it pushed the
 * whole table down by its own height the moment a row was ticked.
 *
 * **Portalled, not lifted.** Selection state belongs to the table (TanStack
 * keys it by row id); only the *markup* moves. Threading a render prop up
 * through six section components would have moved the state with it.
 *
 * **Renders in place when no slot is mounted**, so a table in a story or a
 * unit test still shows its bar rather than silently dropping it.
 *
 * **Whether this earns a file at all is open.** Not a question of which
 * library -- every Base UI `Portal` is a part of its own `Root` and throws
 * outside it, and Radix's `Slot` merges props rather than portalling -- but of
 * whether one `flex items-center gap-2` div is worth a module. The costed
 * alternative is inlining the context and the portal into `EntitiesSection`.
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
  // No count here: `BulkActionBar` already renders "N selected", so a count on
  // this side puts two of them in one row.
  const body = <div className="flex items-center gap-2">{children}</div>
  return slot ? createPortal(body, slot) : body
}
