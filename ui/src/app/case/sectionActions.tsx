import { createContext, useCallback, useContext, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'

/**
 * A command's id, as the registry spells it. A string rather than a union: the
 * registry is data the sheet and the palette read, and a section publishing a
 * handler for an id nobody declared is caught by the palette drawing no row
 * for it, not by this bridge.
 */
type CommandId = string

/**
 * The bridge between a mounted section's action row and the chord layer.
 *
 * **The problem it solves is a string.** The activity dialog is component
 * state with no address, so there is nothing to navigate to and `new-activity`
 * would otherwise be dispatched by finding the section's button in the DOM -
 * `clickAfterRender('[data-slot="new-activity"]')`. That makes the keyboard
 * layer depend on markup it does not import: a
 * rename in `TimelineContainer` left the chord navigating correctly and silently
 * clicking nothing, which no navigation assertion can see.
 *
 * `SectionActionRow` publishes the handlers it is already rendering, and the
 * chord layer runs the same function. The selector, `clickAfterRender` and the
 * `data-slot` contract all go.
 *
 * **Publishing is one-way and the row is the source.** Nothing reads this to
 * decide what to *draw* - an earlier cut did, and it made a section render no
 * buttons at all outside a provider. What is drawn comes from the row's own
 * props; this only makes it reachable from the keyboard.
 */

type Handlers = Partial<Record<CommandId, () => void>>

interface SectionActions {
  /** Replace the handlers a section offers. Returns a cleanup that drops them. */
  publish: (section: string, handlers: Handlers) => () => void
  /** Runs the handler if a mounted section offers it. `false` means nobody did. */
  runAction: (id: CommandId) => boolean
}

const Ctx = createContext<SectionActions | undefined>(undefined)

export function SectionActionsProvider({ children }: { children: ReactNode }) {
  // Keyed by section so two mounted rows cannot clobber each other's ids, and
  // so unmounting one drops exactly its own.
  const bySection = useRef(new Map<string, Handlers>())

  const publish = useCallback((section: string, handlers: Handlers) => {
    bySection.current.set(section, handlers)
    return () => {
      bySection.current.delete(section)
    }
  }, [])

  // Reads the ref, never a render-time snapshot: the chord fires from a
  // document listener whose closure would otherwise hold whichever handlers
  // existed when it was attached.
  const runAction = useCallback((id: CommandId) => {
    for (const handlers of bySection.current.values()) {
      const run = handlers[id]
      if (run) {
        run()
        return true
      }
    }
    return false
  }, [])

  const value = useMemo(() => ({ publish, runAction }), [publish, runAction])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/**
 * Read the bridge. Returns a no-op outside a provider rather than throwing -
 * a section rendered in a story or a unit test is a legitimate caller, its row
 * still draws from its own props, and only the keyboard route is absent.
 */
export function useSectionActions(): SectionActions {
  return useContext(Ctx) ?? FALLBACK
}

const FALLBACK: SectionActions = {
  publish: () => () => undefined,
  runAction: () => false,
}
