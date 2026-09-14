/**
 * **A screen's rows follow the case object; what the analyst set follows the
 * case id.**
 *
 * Four collection screens carried the same idiom and had diverged on this, and
 * both halves were wrong in opposite directions. A new case object arrives on
 * every remote write, so clearing on identity wipes an analyst's filters
 * whenever a colleague writes; and the section does not remount per case, so
 * never clearing carries case A's filter chips onto case B and silently
 * narrows a table by a value B may not have. -> #669
 *
 * **What this does not cover:** what each screen picks out of the case, which
 * is the screen's own, and the rendering, which is the screens' tests.
 */
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Case } from '@/api/model'

import { useCaseRows, useResetOnCase } from './case-rows'

const kaseWith = (id: string, rows: string[]) =>
  ({ id, actions: rows.map((one) => ({ id: one })) }) as unknown as Case

const pick = (kase: Case) => kase.actions

/** A screen's own arrangement: rows on the object, the analyst's place on the id. */
const useBoth = (kase: Case | undefined, cleared: () => void) => {
  const held = useCaseRows(kase, pick)
  useResetOnCase(kase, cleared)
  return held
}

describe('a screen drawing one case', () => {
  it('takes the rows of a case it is given again with new contents', () => {
    const cleared = vi.fn()
    const { result, rerender } = renderHook(
      ({ kase }: { kase: Case }) => useBoth(kase, cleared),
      { initialProps: { kase: kaseWith('case-a', ['one']) } },
    )

    // A colleague's write: same case, a new object, another row.
    rerender({ kase: kaseWith('case-a', ['one', 'two']) })

    expect(result.current[0]).toHaveLength(2)
  })

  it('keeps what the analyst set when a colleague writes', () => {
    const cleared = vi.fn()
    const { rerender } = renderHook(
      ({ kase }: { kase: Case }) => useBoth(kase, cleared),
      { initialProps: { kase: kaseWith('case-a', ['one']) } },
    )

    rerender({ kase: kaseWith('case-a', ['one', 'two']) })

    expect(
      cleared,
      'a colleague writing cleared the search and filters mid-investigation, ' +
        'because a new object cannot be told from a different case by identity',
    ).not.toHaveBeenCalled()
  })

  it('clears what the analyst set when the case underneath it changes', () => {
    const cleared = vi.fn()
    const { rerender } = renderHook(
      ({ kase }: { kase: Case }) => useBoth(kase, cleared),
      { initialProps: { kase: kaseWith('case-a', ['one']) } },
    )

    rerender({ kase: kaseWith('case-b', ['other']) })

    expect(
      cleared,
      'the filter chips of case A were carried onto case B, silently narrowing a table by ' +
        'a value B may not have',
    ).toHaveBeenCalledTimes(1)
  })

  it('takes the rows of the case it moves to', () => {
    const { result, rerender } = renderHook(
      ({ kase }: { kase: Case }) => useCaseRows(kase, pick),
      { initialProps: { kase: kaseWith('case-a', ['one']) } },
    )

    rerender({ kase: kaseWith('case-b', ['other', 'another']) })

    expect(result.current[0]).toHaveLength(2)
  })

  /**
   * **A write reflects its own result without waiting for the case.** The
   * setter is what a screen uses between its write landing and the case being
   * read again.
   */
  it('takes what a write on the screen put there', () => {
    // Built once: a fresh object per render is a new case every time, and the
    // hook would resync over the write -- which is what a screen passing a
    // freshly-built case rather than its prop would do.
    const same = kaseWith('case-a', ['one'])
    const { result } = renderHook(() => useCaseRows(same, pick))

    act(() => {
      result.current[1]([{ id: 'written' }] as never)
    })

    expect(result.current[0]).toEqual([{ id: 'written' }])
  })

  /**
   * **An absent case is not a case switch.** A screen's toolbar is live while
   * the case loads, so a search typed during the load must survive it
   * arriving -- this docstring said so and the assertion said the opposite.
   */
  it('draws nothing before the case arrives, and clears nothing', () => {
    const cleared = vi.fn()
    const { result, rerender } = renderHook(
      ({ kase }: { kase: Case | undefined }) => useBoth(kase, cleared),
      { initialProps: { kase: undefined as Case | undefined } },
    )

    expect(result.current[0]).toEqual([])

    rerender({ kase: kaseWith('case-a', ['one']) })

    expect(result.current[0]).toHaveLength(1)
    expect(
      cleared,
      'the case arriving for the first time was read as the analyst switching away from one, ' +
        'so a search typed while it loaded is wiped the moment it lands',
    ).not.toHaveBeenCalled()
  })

  /**
   * **A case leaving and another arriving is one move.** `undefined` between
   * two cases is the read in flight, not a third place the analyst went.
   */
  it('clears once when one case is replaced by another through nothing', () => {
    const cleared = vi.fn()
    const { rerender } = renderHook(
      ({ kase }: { kase: Case | undefined }) => useBoth(kase, cleared),
      { initialProps: { kase: kaseWith('case-a', ['one']) } },
    )

    rerender({ kase: undefined })
    rerender({ kase: kaseWith('case-b', ['other']) })

    expect(cleared).toHaveBeenCalledTimes(1)
  })
})
