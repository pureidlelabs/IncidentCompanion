/**
 * Holding a row, and giving it back.
 *
 * **The release is the half worth testing.** A claim nobody releases holds a
 * row until the socket drops - so the paths that matter are the ones nobody
 * writes a release for: closing, unmounting, and the row changing underneath
 * an open surface.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { RowActions } from '@/components/blocks/row-actions'
import { ClaimsProvider, RowClaim, useHoldRow, type RowClaims } from './presence'

function claimsFor(held: Record<string, string> = {}): RowClaims & {
  taken: string[]; given: string[]
} {
  const taken: string[] = []
  const given: string[] = []
  return {
    taken,
    given,
    you: 'u-me',
    // The name and the id are both here because the component uses each for a
    // different job: `username` is drawn, `user_id` decides whether it is you.
    holderOf: (table, id) =>
      held[`${table}:${id}`]
        ? { user_id: `u-${held[`${table}:${id}`]!}`, username: held[`${table}:${id}`]! }
        : undefined,
    claim: (table, id) => { taken.push(`${table}:${id}`) },
    release: (table, id) => { given.push(`${table}:${id}`) },
  }
}

function Holder({ claims, table, entryId, active }: {
  claims: RowClaims
  table: string
  entryId?: string | undefined
  active: boolean
}) {
  return (
    <ClaimsProvider value={claims}>
      <Inner table={table} entryId={entryId} active={active} />
    </ClaimsProvider>
  )
}

function Inner({ table, entryId, active }: {
  table: string; entryId?: string | undefined; active: boolean
}) {
  useHoldRow(table, entryId, active)
  return null
}

/**
 * A handler that only has to *exist*.
 *
 * `RowActions` renders a control when it is given something to call, and
 * every test here is about whether that control refuses - never about
 * what it would have done.
 */
const offered = () => { /* the control is the subject, not the call */ }

describe('useHoldRow', () => {
  it('takes the row while the surface is open', () => {
    const claims = claimsFor()
    render(<Holder claims={claims} table="systems" entryId="s-1" active />)

    expect(claims.taken).toEqual(['systems:s-1'])
  })

  it('gives it back when the surface closes', () => {
    const claims = claimsFor()
    const view = render(
      <Holder claims={claims} table="systems" entryId="s-1" active />)
    view.rerender(
      <Holder claims={claims} table="systems" entryId="s-1" active={false} />)

    expect(claims.given).toEqual(['systems:s-1'])
  })

  it('gives it back when the surface unmounts', () => {
    // The path nobody writes a release for: a route change, or a component
    // that throws. Without it the row stays held until the socket drops.
    const claims = claimsFor()
    const view = render(
      <Holder claims={claims} table="systems" entryId="s-1" active />)
    view.unmount()

    expect(claims.given).toEqual(['systems:s-1'])
  })

  it('moves the claim when the open surface changes row', () => {
    // A dialog reused for the next row: the first row has to be released, or
    // one analyst accumulates every row they have looked at.
    const claims = claimsFor()
    const view = render(
      <Holder claims={claims} table="systems" entryId="s-1" active />)
    view.rerender(
      <Holder claims={claims} table="systems" entryId="s-2" active />)

    expect(claims.given).toEqual(['systems:s-1'])
    expect(claims.taken).toEqual(['systems:s-1', 'systems:s-2'])
  })

  it('claims nothing in create mode, where there is no row', () => {
    const claims = claimsFor()
    render(<Holder claims={claims} table="systems" entryId={undefined} active />)

    expect(claims.taken).toEqual([])
  })

  it('claims nothing outside a case', () => {
    // The picker and every story render these blocks with no provider. A hook
    // that threw there would make the kit unusable outside the workspace.
    expect(() =>
      render(<Inner table="systems" entryId="s-1" active />)).not.toThrow()
  })
})

describe('RowClaim', () => {
  it('names the other analyst', () => {
    const view = render(
      <ClaimsProvider value={claimsFor({ 'systems:s-1': 'r.okonkwo' })}>
        <RowClaim table="systems" entryId="s-1" />
      </ClaimsProvider>)

    expect(view.container.textContent).toContain('r.okonkwo')
  })

  it('says nothing about a row this analyst holds', () => {
    // Marking your own row tells you what you already know, on every row you
    // touch - noise exactly where the badge needs to mean something.
    const view = render(
      <ClaimsProvider value={claimsFor({ 'systems:s-1': 'me' })}>
        <RowClaim table="systems" entryId="s-1" />
      </ClaimsProvider>)

    expect(view.container.textContent).toBe('')
  })

  it('says nothing about an unheld row', () => {
    const view = render(
      <ClaimsProvider value={claimsFor()}>
        <RowClaim table="systems" entryId="s-1" />
      </ClaimsProvider>)

    expect(view.container.textContent).toBe('')
  })

  it('draws nothing with no case at all', () => {
    const view = render(<RowClaim table="systems" entryId="s-1" />)
    expect(view.container.textContent).toBe('')
  })
})

describe('the provider is stable enough to hold a table', () => {
  it('does not re-take the claim when an unrelated render happens', () => {
    // The value is a context, so a fresh literal every render would re-run
    // every holder's effect - releasing and re-taking the row on each render
    // of the shell, which is a message per keystroke elsewhere on the case.
    const claims = claimsFor()
    const view = render(
      <Holder claims={claims} table="systems" entryId="s-1" active />)
    view.rerender(
      <Holder claims={claims} table="systems" entryId="s-1" active />)

    expect(claims.taken).toEqual(['systems:s-1'])
    expect(claims.given).toEqual([])
  })
})


describe('the claim holds the row, not just marks it', () => {
  /**
   * Two analysts in one edit dialog is a guaranteed conflict, and being told
   * before starting beats a merge review afterwards.
   *
   * It cannot wedge a row - the claim is released on close, on unmount, on a
   * dropped socket and by a TTL - and it is not the only protection, because
   * the API door and a dropped socket both bypass it. The row version and the
   * review are still underneath.
   */
  it('refuses edit and delete while somebody else is in the row', () => {
    render(<RowActions label="host-a" heldBy="r.okonkwo"
      onEdit={offered} onDelete={offered} />)

    // **`aria-disabled`, not `toBeDisabled()`.** Base UI's toolbar button
    // keeps a disabled item focusable and in the roving tab order - which is
    // right, since a control an analyst cannot reach is a control they cannot
    // discover the reason for - so there is no native `disabled` attribute
    // and jest-dom's matcher reports it as enabled.
    expect(screen.getByLabelText('Edit host-a in full')
      .getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByLabelText('Delete host-a')
      .getAttribute('aria-disabled')).toBe('true')
  })

  it('says who, on the control that is refusing', async () => {
    // A disabled pencil with no reason reads as a permission the analyst does
    // not have. Naming the colleague makes it a thing to resolve by asking.
    //
    // **A tooltip, where this was a `title` attribute.** React Aria drops
    // `title` - `filterDOMProps` passes `id`, the aria-labelling props and five
    // globals, and nothing else - so the attribute never reached the DOM. The
    // property is the same and the mechanism is better: a `title` is invisible
    // to the keyboard and to touch, and this control stays focusable while
    // refusing precisely so the reason can be reached.
    render(<RowActions label="host-a" heldBy="r.okonkwo" onEdit={offered} />)

    // Focus rather than hover: React Aria warms a hover tooltip for 1500ms
    // and shows a focused one at once. Focus is the path that matters here --
    // the control keeps its tab stop so the refusal is reachable without a
    // pointer.
    await userEvent.tab()

    expect(screen.getByLabelText('Edit host-a in full')).toHaveFocus()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('r.okonkwo is editing this')
  })

  it('leaves the row editable when nobody holds it', () => {
    render(<RowActions label="host-a" onEdit={offered} onDelete={offered} />)

    expect(screen.getByLabelText('Edit host-a in full')
      .getAttribute('aria-disabled')).not.toBe('true')
    expect(screen.getByLabelText('Delete host-a')
      .getAttribute('aria-disabled')).not.toBe('true')
  })

  it('still lets the row be expanded and read', () => {
    // Held is not hidden. An analyst who cannot edit a row can still look at
    // it, and taking that away would let a colleague's open dialog blank a
    // section of the case.
    render(<RowActions label="host-a" heldBy="r.okonkwo" expanded={false}
      onToggleExpanded={offered} onEdit={offered} />)

    expect(screen.getByLabelText('Show detail')
      .getAttribute('aria-disabled')).not.toBe('true')
  })
})
