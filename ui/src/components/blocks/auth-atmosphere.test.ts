/**
 * When each beat of the atmosphere copy starts.
 */
import { describe, expect, it } from 'vitest'

import { typingSeconds } from '@/components/ui/typed-line'

import { BEAT_GAP, beatDelays } from './auth-atmosphere'

describe('the atmosphere beats', () => {
  it('starts the first line at once', () => {
    expect(beatDelays(['A short line.'])[0]).toBe(0)
  })

  it('says nothing about a pane carrying no copy', () => {
    expect(beatDelays([])).toEqual([])
  })

  /**
   * The attack: a delay that does not read the line before it.
   */
  it('pushes the second beat back when the first line grows', () => {
    const short = beatDelays(['Short.', 'The second beat.'])
    const long = beatDelays([
      'A first line considerably longer than the short one above it.',
      'The second beat.',
    ])
    expect(long[1]).toBeGreaterThan(short[1] ?? 0)
  })

  it('waits out the first line and then the gap', () => {
    const first = 'Untangling the intrusion is the hard part.'
    expect(beatDelays([first, 'The report should not be.'])[1]).toBeCloseTo(
      typingSeconds(first) + BEAT_GAP,
      6,
    )
  })

  /**
   * The attack: an accumulator reset each line.
   */
  it('accumulates across every line before it, not just the last one', () => {
    const lines = ['One.', 'A rather longer second line.', 'Three.']
    const delays = beatDelays(lines)
    expect(delays[2]).toBeCloseTo(
      typingSeconds(lines[0] ?? '') + typingSeconds(lines[1] ?? '') + BEAT_GAP * 2,
      6,
    )
  })

  it('gives every line a beat', () => {
    expect(beatDelays(['One.', 'Two.', 'Three.', 'Four.'])).toHaveLength(4)
  })

  /** The gap is the caller's, so a pane that wants a longer pause gets one. */
  it('takes the pause between beats from the caller', () => {
    const lines = ['One.', 'Two.']
    expect(beatDelays(lines, 2)[1]).toBeCloseTo(typingSeconds('One.') + 2, 6)
  })
})
