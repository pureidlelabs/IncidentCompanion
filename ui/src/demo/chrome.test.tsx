/**
 * A first visit is asked to read what the demo is, once per browser.
 *
 * What jsdom cannot see: the dialog's scrim and the strip's corner. What it
 * holds is the order - nothing written before the press, and nothing asked
 * again after it - and that a browser refusing storage is asked rather than
 * broken.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DemoChrome } from './chrome'

const KEY = 'incidentcompanion.demo.acknowledged'

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the acknowledgement', () => {
  it('is asked on a first visit, and nothing is stored until it is pressed', async () => {
    render(<DemoChrome build="abc1234" onReset={vi.fn()} />)
    expect(screen.getByRole('alertdialog', { name: 'This is a demo' })).toBeInTheDocument()
    expect(window.localStorage.getItem(KEY)).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Understood' }))
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog', { name: 'This is a demo' })).not.toBeInTheDocument()
    })
    expect(window.localStorage.getItem(KEY)).toBe('1')
  })

  it('is not asked again once this browser has read it', () => {
    window.localStorage.setItem(KEY, '1')
    render(<DemoChrome build="abc1234" onReset={vi.fn()} />)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('is asked, not broken, where storage is refused', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    render(<DemoChrome build="abc1234" onReset={vi.fn()} />)
    expect(screen.getByRole('alertdialog', { name: 'This is a demo' })).toBeInTheDocument()
  })
})

describe('the strip', () => {
  it('names the build, offers the source, and asks before a reset', async () => {
    window.localStorage.setItem(KEY, '1')
    const onReset = vi.fn()
    render(<DemoChrome build="abc1234" onReset={onReset} />)
    expect(screen.getByText('demo · abc1234')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'source' })).toHaveAttribute(
      'href',
      'https://github.com/pureidlelabs/IncidentCompanion',
    )

    await userEvent.click(screen.getByRole('button', { name: 'reset' }))
    expect(onReset).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Start again' }))
    expect(onReset).toHaveBeenCalledTimes(1)
  })
})
