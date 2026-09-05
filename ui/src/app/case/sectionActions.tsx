import { createContext, useCallback, useContext, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'

/**
 * A command's id, as the registry spells it.
 */
type CommandId = string

/**
 * The bridge between a mounted section's action row and the chord layer.
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
 * Read the bridge.
 */
export function useSectionActions(): SectionActions {
  return useContext(Ctx) ?? FALLBACK
}

const FALLBACK: SectionActions = {
  publish: () => () => undefined,
  runAction: () => false,
}
