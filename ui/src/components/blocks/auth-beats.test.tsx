/**
 * That the beats a pane draws are given the delays it worked out.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AuthBeats, beatDelays } from './auth-atmosphere'

vi.mock('@/components/ui/typed-line', () => ({
  CHARS_PER_SECOND: 1,
  typingSeconds: (text: string) => text.length,
  TypedLine: ({
    text,
    delay = 0,
    className,
  }: {
    text: string
    delay?: number
    className?: string
  }) => (
    <span data-testid="beat" data-delay={String(delay)} className={className}>
      {text}
    </span>
  ),
}))

describe('the beats a pane draws', () => {
  it('gives each line the delay it worked out', () => {
    const lines = ['One.', 'A rather longer second line.', 'Three.']
    render(<AuthBeats lines={lines} />)
    const drawn = screen.getAllByTestId('beat').map((node) => node.dataset.delay)
    expect(drawn).toEqual(beatDelays(lines).map(String))
  })

  /** The first line is the pane's own weight; the rest settle under it. */
  it('sets every line after the first normal and muted', () => {
    render(<AuthBeats lines={['One.', 'Two.']} />)
    const drawn = screen.getAllByTestId('beat')
    expect(drawn[0]?.className).toBeFalsy()
    expect(drawn[1]?.className).toContain('text-ink-muted')
  })

  it('draws one line for each the caller names', () => {
    render(<AuthBeats lines={['One.', 'Two.', 'Three.']} />)
    expect(screen.getAllByTestId('beat')).toHaveLength(3)
  })
})
