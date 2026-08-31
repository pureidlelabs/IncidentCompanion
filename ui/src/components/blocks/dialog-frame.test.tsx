import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DialogFrame } from './dialog-frame'

/**
 * When a dialog draws a footer at all, and where `bleed` puts the children.
 *
 * Both are structure, so jsdom decides them. The scroller `DialogBody` carries
 * is geometry and is not asserted here - what is asserted is that `bleed`
 * removes the element, which is the observable half and the one a caller's own
 * panes depend on.
 */

const draw = (ui: React.ReactNode) => render(<>{ui}</>)

describe('the footer', () => {
  /**
   * An element that renders empty still costs a border and a ground.
   *
   * `DialogActions` paints a top rule and a muted bar, so drawing it for a
   * dialog with neither footnote nor actions gives every read-only dialog a
   * grey stripe under its body with nothing in it.
   */
  it('draws nothing when neither footnote nor actions is passed', () => {
    const { container } = draw(
      <DialogFrame title="Add system">
        <p>body</p>
      </DialogFrame>,
    )
    expect(container.querySelector('[data-slot="dialog-actions"]')).toBeNull()
  })

  it('draws the footer for actions alone', () => {
    const { container } = draw(
      <DialogFrame title="Add system" actions={<button type="button">Save</button>}>
        <p>body</p>
      </DialogFrame>,
    )
    expect(container.querySelector('[data-slot="dialog-actions"]')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('draws the footer for a footnote alone', () => {
    const { container } = draw(
      <DialogFrame title="Add system" footnote={<span>Saved 2 minutes ago</span>}>
        <p>body</p>
      </DialogFrame>,
    )
    expect(container.querySelector('[data-slot="dialog-actions"]')).not.toBeNull()
    expect(screen.getByText('Saved 2 minutes ago')).toBeInTheDocument()
  })

  it('leaves the footnote half empty when only actions are passed', () => {
    const { container } = draw(
      <DialogFrame title="Add system" actions={<button type="button">Save</button>}>
        <p>body</p>
      </DialogFrame>,
    )
    expect(container.querySelector('[data-slot="dialog-footnote"]')?.textContent).toBe('')
  })
})

describe('bleed', () => {
  it('wraps the children in the kit body by default', () => {
    const { container } = draw(
      <DialogFrame title="Add system">
        <p data-testid="body">body</p>
      </DialogFrame>,
    )
    expect(screen.getByTestId('body').parentElement).not.toBe(container)
  })

  it('hands the children straight through when bleed is set', () => {
    const { container } = draw(
      <DialogFrame title="Add system" bleed>
        <p data-testid="body">body</p>
      </DialogFrame>,
    )
    expect(screen.getByTestId('body').parentElement).toBe(container)
  })
})

describe('the head', () => {
  it('draws no dismiss control without onClose', () => {
    draw(
      <DialogFrame title="Add system">
        <p>body</p>
      </DialogFrame>,
    )
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
  })

  it('draws the dismiss control when onClose is passed', () => {
    draw(
      <DialogFrame title="Add system" onClose={() => undefined}>
        <p>body</p>
      </DialogFrame>,
    )
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })
})
