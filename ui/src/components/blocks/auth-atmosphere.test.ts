/**
 * When each beat of the atmosphere copy starts.
 *
 * The arithmetic is the whole reason the pane reads as a sentence arriving: a
 * beat waits out the typing time of everything before it, so the gap between
 * two lines is a gap and not an overlap. A constant delay looks right against
 * the copy it was tuned on and collapses the moment the copy is edited, which
 * is the defect these attack.
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
   * The attack: a delay that does not read the line before it. A constant gap
   * passes every assertion written against one fixed pair of sentences, so
   * this holds two pairs whose only difference is the length of the first.
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
   * The attack: an accumulator reset each line. Reading only the previous
   * line's typing time gives a third beat that starts while the second is
   * still typing, and two lines can never tell the two implementations apart.
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
