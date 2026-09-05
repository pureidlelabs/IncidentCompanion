import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { EvidenceScreen } from './evidence'
import { MethodsScreen } from './methods'

/**
 * **A new case replaces the rows; the same case leaves them alone.**
 */
describe('the rows re-sync on a new case', () => {
  it('draws the rows of the case it is given', () => {
    render(<EvidenceScreen kase={campaignCase} specs={specsFixture} />)

    const first = campaignCase.evidence[0]
    expect(first).toBeDefined()
    expect(screen.getByText(first!.name)).toBeInTheDocument()
  })

  it('replaces the rows when a different case object arrives', () => {
    const { rerender } = render(<EvidenceScreen kase={campaignCase} specs={specsFixture} />)

    const gone = campaignCase.evidence[0]
    expect(gone).toBeDefined()
    expect(screen.getByText(gone!.name)).toBeInTheDocument()

    // What a container passes after another analyst's write: a new object,
    // one record shorter.
    rerender(
      <EvidenceScreen
        kase={{ ...campaignCase, evidence: campaignCase.evidence.slice(1) }}
        specs={specsFixture}
      />,
    )

    expect(screen.queryByText(gone!.name)).toBeNull()
  })

  it('leaves the rows alone when the same case object is passed again', () => {
    const { rerender } = render(<MethodsScreen kase={campaignCase} specs={specsFixture} />)

    const first = campaignCase.methods[0]
    expect(first).toBeDefined()
    const before = screen.getByText(first!.name)

    // The identity is unchanged, so nothing about the list may be rebuilt --
    // this is the render a parent causes for its own reasons.
    rerender(<MethodsScreen kase={campaignCase} specs={specsFixture} />)

    expect(screen.getByText(first!.name)).toBe(before)
  })

  it('holds the pane back while the read is still in flight', () => {
    render(<MethodsScreen kase={campaignCase} specs={specsFixture} busy />)

    const first = campaignCase.methods[0]
    expect(first).toBeDefined()
    expect(screen.queryByText(first!.name)).toBeNull()
  })

  // **Both screens, every state.** Only methods had a `busy` case and only
  // evidence had a re-sync case, so `isPending: busy` could be replaced with
  // `false` in `evidence.tsx` and the whole screens suite stayed green.
  it('holds the evidence pane back while the read is still in flight', () => {
    render(<EvidenceScreen kase={campaignCase} specs={specsFixture} busy />)

    const first = campaignCase.evidence[0]
    expect(first).toBeDefined()
    expect(screen.queryByText(first!.name)).toBeNull()
  })

  it('replaces the methods rows when a different case object arrives', () => {
    const { rerender } = render(<MethodsScreen kase={campaignCase} specs={specsFixture} />)

    const gone = campaignCase.methods[0]
    expect(gone).toBeDefined()
    expect(screen.getByText(gone!.name)).toBeInTheDocument()

    rerender(
      <MethodsScreen kase={{ ...campaignCase, methods: campaignCase.methods.slice(1) }} specs={specsFixture} />,
    )

    expect(screen.queryByText(gone!.name)).toBeNull()
  })

  it('leaves the evidence rows alone when the same case object is passed again', () => {
    const { rerender } = render(<EvidenceScreen kase={campaignCase} specs={specsFixture} />)

    const first = campaignCase.evidence[0]
    expect(first).toBeDefined()
    const before = screen.getByText(first!.name)

    rerender(<EvidenceScreen kase={campaignCase} specs={specsFixture} />)

    expect(screen.getByText(first!.name)).toBe(before)
  })

  it.each([
    ['evidence', <EvidenceScreen key="e" kase={campaignCase} specs={specsFixture} problem={new Error('The case could not be read.')} />],
    ['methods', <MethodsScreen key="m" kase={campaignCase} specs={specsFixture} problem={new Error('The case could not be read.')} />],
  ])('shows a refusal on %s rather than an empty register', (_name, element) => {
    render(element)

    expect(screen.getByText(/could not be read/)).toBeInTheDocument()
  })
})
