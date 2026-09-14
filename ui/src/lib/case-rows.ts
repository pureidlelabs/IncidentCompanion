/**
 * A screen's rows, and the analyst's place in them, kept in step with the case.
 *
 * **Two different questions, and one `!==` cannot answer both.** A new case
 * object arrives on every remote write, so identity says *the rows may have
 * moved*; it never says *this is a different case*. The section does not
 * remount per case, so a screen has to notice a switch itself, and the id is
 * what says so.
 *
 * Rows follow the object: a colleague's write brings a new one, and a table
 * still showing the old rows is showing the case as it was. What the analyst
 * set follows the id: their search box and filter chips are their place in
 * *this* case, and a colleague writing must not clear them.
 *
 * **Two hooks rather than one, because the filters are built from the rows.**
 * A screen's filter options count the rows they would narrow, so the filters
 * cannot exist before the rows do, and a single call taking both would have to
 * be made before one of its arguments.
 */
import { useState, type Dispatch, type SetStateAction } from 'react'

import type { Case } from '@/api/model'

/**
 * The rows this screen draws, resynced whenever the case object changes.
 *
 * @param kase The case as drawn, or `undefined` before it loads.
 * @param pick The rows this screen draws, out of the case.
 * @returns The rows and `useState`'s own setter, so a write can hand it an
 * updater to reflect its own result before the case is read again.
 */
export function useCaseRows<T>(
  kase: Case | undefined,
  pick: (kase: Case) => readonly T[],
): [readonly T[], Dispatch<SetStateAction<readonly T[]>>] {
  const [rows, setRows] = useState<readonly T[]>(() => (kase ? pick(kase) : []))
  const [given, setGiven] = useState(kase)

  // Set during render rather than in an effect, which is React's own answer
  // for state derived from a prop: an effect draws the previous case's rows
  // once before correcting itself.
  if (given !== kase) {
    setGiven(kase)
    setRows(kase ? pick(kase) : [])
  }

  return [rows, setRows]
}

/**
 * Put back what the analyst set, when the case underneath the screen changes.
 *
 * **On the id, never on the object.** Clearing on the object wipes their
 * search and filters whenever a colleague writes; never clearing carries one
 * case's filter chips onto the next and silently narrows a table by a value
 * the new case may not have.
 *
 * @param kase The case as drawn.
 * @param reset What to put back. Called during render, so it sets state and
 * does nothing else.
 */
export function useResetOnCase(kase: Case | undefined, reset: () => void): void {
  const [given, setGiven] = useState(kase?.id)

  if (given !== kase?.id) {
    setGiven(kase?.id)
    reset()
  }
}
