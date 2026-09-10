import { useState } from 'react'

/** Stable, so a table's meta does not change identity every render. */
const NONE: ReadonlySet<string> = new Set()

/**
 * The rows a write is touching, and a wrapper that marks them busy for the
 * length of one write and clears them however it ends.
 *
 * A refusal is an answer, not an error, so nothing is caught: a rejected
 * write leaves the rows untouched and the rejection reaches the caller.
 */
export function useInFlight(): [
  ReadonlySet<string>,
  (ids: readonly string[], run: () => Promise<void>) => Promise<void>,
] {
  const [writing, setWriting] = useState(NONE)
  const inFlight = async (ids: readonly string[], run: () => Promise<void>) => {
    setWriting(new Set(ids))
    try {
      await run()
    } finally {
      setWriting(NONE)
    }
  }
  return [writing, inFlight]
}
