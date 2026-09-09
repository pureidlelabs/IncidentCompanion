/**
 * A fold is remembered when the analyst pressed it, and not when the viewport
 * chose it. jsdom sees the store and the value; it cannot see the rail.
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { usePersistedFlag } from './persistedFlag'

const KEY = 'test.fold'

beforeEach(() => {
  window.localStorage.clear()
})

describe('a persisted flag', () => {
  it("writes nothing on the first render, so a viewport's choice is not remembered", () => {
    const { result } = renderHook(() => usePersistedFlag(KEY, true))
    expect(result.current[0]).toBe(true)
    expect(window.localStorage.getItem(KEY)).toBeNull()
  })

  it('writes the press, and reads it back over the fallback', () => {
    const first = renderHook(() => usePersistedFlag(KEY, true))
    act(() => {
      first.result.current[1]()
    })
    expect(first.result.current[0]).toBe(false)
    expect(window.localStorage.getItem(KEY)).toBe('false')

    const second = renderHook(() => usePersistedFlag(KEY, true))
    expect(second.result.current[0]).toBe(false)
  })
})
