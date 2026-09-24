/**
 * What the band says when another analyst changed a field this analyst is
 * changing, and what its two presses do.
 *
 * Every assertion here is an attack on the one thing the band exists to do:
 * put both values in front of the analyst and let them choose. A band that
 * names the wrong field, quotes nothing, or writes on a press that was meant
 * to discard renders perfectly and reads as working.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { MergeReview } from './merge-review'

function band(theirs: unknown = 'compromised') {
  const onKeep = vi.fn()
  const onTake = vi.fn()
  render(
    <MergeReview field="Verdict" by="A. Okonkwo" theirs={theirs} onKeep={onKeep} onTake={onTake} />,
  )
  return { onKeep, onTake }
}

describe('a field another analyst changed', () => {
  it('names the field and who changed it, as the group it is', () => {
    band()
    expect(screen.getByRole('group', { name: 'A. Okonkwo changed Verdict' })).toBeVisible()
  })

  it('quotes the value they stored, and says the analyst still has theirs', () => {
    band()
    expect(screen.getByText('Theirs: compromised. Yours is still in the field.')).toBeVisible()
  })

  it('is announced rather than waiting to be scanned', () => {
    band()
    expect(screen.getByRole('alert')).toHaveTextContent('A. Okonkwo changed Verdict')
  })

  it('quotes an emptied value as nothing, and a set as its members', () => {
    band('')
    expect(screen.getByText(/Theirs: nothing\./)).toBeVisible()
  })

  it('keeps the analyst value only on the press that says so', async () => {
    const { onKeep, onTake } = band()
    await userEvent.click(screen.getByRole('button', { name: 'Keep mine' }))
    expect([onKeep.mock.calls.length, onTake.mock.calls.length]).toEqual([1, 0])
  })

  it('takes theirs only on the press that says so', async () => {
    const { onKeep, onTake } = band(['a', 'b'])
    expect(screen.getByText(/Theirs: a, b\./)).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Take theirs' }))
    expect([onKeep.mock.calls.length, onTake.mock.calls.length]).toEqual([0, 1])
  })
})
