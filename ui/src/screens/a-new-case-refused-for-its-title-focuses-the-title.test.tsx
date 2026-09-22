import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { specsFixture } from '@/fixtures/specs'

import { NewCaseScreen } from './new-case'

describe('a new case refused for its title', () => {
  // An empty title is the browser's own `required` refusal, which focuses the
  // field itself; only a title of spaces reaches the screen's check.
  it('puts the caret back in a title of spaces', async () => {
    const create = vi.fn()
    render(<NewCaseScreen templates={[]} specs={specsFixture} writes={{ create }} />)
    const title = screen.getByRole('textbox', { name: /title/i })
    await userEvent.type(title, '   ')
    await userEvent.click(screen.getByRole('textbox', { name: /customer/i }))
    expect(title).not.toHaveFocus()

    await userEvent.click(screen.getByRole('button', { name: 'Create case' }))

    expect(create).not.toHaveBeenCalled()
    expect(screen.getByText('Required.')).toBeInTheDocument()
    expect(title).toHaveFocus()
  })

  it('posts only what was filled, and always the title', async () => {
    const create = vi.fn(() => new Promise<never>(() => undefined))
    render(<NewCaseScreen templates={[]} specs={specsFixture} writes={{ create }} />)
    await userEvent.type(screen.getByRole('textbox', { name: /title/i }), 'Mailbox read in bulk')
    await userEvent.type(screen.getByRole('textbox', { name: /customer/i }), '  ')

    await userEvent.click(screen.getByRole('button', { name: 'Create case' }))

    expect(create).toHaveBeenCalledWith({ title: 'Mailbox read in bulk' })
  })
})
