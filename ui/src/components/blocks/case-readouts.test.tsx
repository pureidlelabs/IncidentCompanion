import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CaseReadouts } from './case-readouts'

describe('CaseReadouts', () => {
  it('counts the day from detection when there is one, and from opening otherwise', () => {
    const now = Date.parse('2026-09-10T08:00:00Z')
    const { rerender } = render(
      <CaseReadouts title="Phishing" openedAt="2026-09-09T21:00:00Z" now={now} />,
    )
    expect(screen.getByText('day').nextSibling).toHaveTextContent('1')
    rerender(
      <CaseReadouts
        title="Phishing"
        openedAt="2026-09-09T21:00:00Z"
        detectedAt="2026-09-07T09:00:00Z"
        now={now}
      />,
    )
    expect(screen.getByText('day').nextSibling).toHaveTextContent('3')
    expect(screen.getByTitle('Phishing')).toBeInTheDocument()
  })
})
