/**
 * What the credential form does with a submit, and what it draws around one.
 *
 * The block owns three things a screen kept re-deriving: the browser is
 * stopped from posting the form itself, the submit swaps its own words while
 * the exchange is in flight, and the recovery route sits between the fields
 * and the submit. Each is asserted against a caller whose words are nothing
 * this product says, so a default leaking back in is visible.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { TextField } from '@/components/ui/text-field'

import { AuthForm } from './auth-form'

describe('the credential form', () => {
  /**
   * The attack: a handler that reads the form and forgets to stop the
   * browser. The page reloads, the caller's handler runs first, and every
   * assertion about `onSubmit` still passes.
   */
  it('stops the browser posting the form itself', async () => {
    const user = userEvent.setup()
    let prevented: boolean | undefined
    const watch = (event: Event) => {
      prevented = event.defaultPrevented
    }
    document.addEventListener('submit', watch)
    try {
      render(
        <AuthForm submit="Proceed" pending="Proceeding" onSubmit={vi.fn()}>
          <TextField label="Handle" value="" onChange={vi.fn()} />
        </AuthForm>,
      )
      await user.click(screen.getByRole('button', { name: 'Proceed' }))
    } finally {
      document.removeEventListener('submit', watch)
    }
    expect(prevented).toBe(true)
  })

  it('hands the submit to the caller, once', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <AuthForm submit="Proceed" pending="Proceeding" onSubmit={onSubmit}>
        <TextField label="Handle" value="" onChange={vi.fn()} />
      </AuthForm>,
    )

    await user.click(screen.getByRole('button', { name: 'Proceed' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  /**
   * The attack: a submit that keeps its resting words and only spins, or one
   * that spins without being told to.
   *
   * **What this cannot see is the resting label leaving.** The kit's submit
   * crossfades the two through Motion's `AnimatePresence`, and jsdom runs no
   * frame loop -- so the outgoing label stays in the tree for the whole test
   * and the button's accessible name is both words joined. The pending words
   * arriving, and `data-pending` with them, is the half a DOM can answer.
   */
  it('swaps the submit words while the exchange is in flight', () => {
    const { rerender } = render(
      <AuthForm submit="Proceed" pending="Proceeding" onSubmit={vi.fn()}>
        <TextField label="Handle" value="" onChange={vi.fn()} />
      </AuthForm>,
    )
    expect(screen.getByRole('button', { name: 'Proceed' })).not.toHaveAttribute('data-pending')
    expect(screen.queryByText('Proceeding')).toBeNull()

    rerender(
      <AuthForm submit="Proceed" pending="Proceeding" isPending onSubmit={vi.fn()}>
        <TextField label="Handle" value="" onChange={vi.fn()} />
      </AuthForm>,
    )
    expect(screen.getByText('Proceeding')).toBeInTheDocument()
    expect(screen.getByRole('button')).toHaveAttribute('data-pending', 'true')
  })

  /** The words and the route are the caller's, so nothing of this app is baked in. */
  it('draws the recovery route the caller names', () => {
    render(
      <AuthForm
        submit="Proceed"
        pending="Proceeding"
        recovery={{ label: 'Lost your key', href: '/recover' }}
        onSubmit={vi.fn()}
      >
        <TextField label="Handle" value="" onChange={vi.fn()} />
      </AuthForm>,
    )
    expect(screen.getByRole('link', { name: 'Lost your key' })).toHaveAttribute(
      'href',
      '/recover',
    )
  })

  /**
   * The attack: a recovery row drawn unconditionally. An empty row is a gap
   * above the submit on every form that has no recovery route, and it renders
   * as nothing a query for a link would find -- so the link is what is asked
   * for, and the row is asked for by its absence from the form's children.
   */
  it('draws no recovery route when the caller names none', () => {
    render(
      <AuthForm submit="Proceed" pending="Proceeding" onSubmit={vi.fn()}>
        <TextField label="Handle" value="" onChange={vi.fn()} />
      </AuthForm>,
    )
    expect(screen.queryByRole('link')).toBeNull()
  })

  /**
   * Advice by default, refusal on request.
   *
   * `noValidate` is how React Aria's form carries the choice: it is set for
   * every behaviour except `native`, so the browser gates the submit only
   * where a caller asked it to.
   */
  it('leaves the platform out of the way unless the caller asks for it', () => {
    const { container, rerender } = render(
      <AuthForm submit="Proceed" pending="Proceeding" onSubmit={vi.fn()}>
        <TextField label="Handle" value="" onChange={vi.fn()} />
      </AuthForm>,
    )
    expect(container.querySelector('form')).toHaveAttribute('novalidate')

    rerender(
      <AuthForm
        submit="Proceed"
        pending="Proceeding"
        validationBehavior="native"
        onSubmit={vi.fn()}
      >
        <TextField label="Handle" value="" onChange={vi.fn()} />
      </AuthForm>,
    )
    expect(container.querySelector('form')).not.toHaveAttribute('novalidate')
  })

  /** The submit is last, after everything the caller put in the form. */
  it('puts the submit after the fields and the recovery route', () => {
    render(
      <AuthForm
        submit="Proceed"
        pending="Proceeding"
        recovery={{ label: 'Lost your key', href: '/recover' }}
        onSubmit={vi.fn()}
      >
        <TextField label="Handle" value="" onChange={vi.fn()} />
      </AuthForm>,
    )
    const order = [
      screen.getByLabelText('Handle'),
      screen.getByRole('link', { name: 'Lost your key' }),
      screen.getByRole('button', { name: 'Proceed' }),
    ]
    for (const [index, node] of order.slice(1).entries()) {
      const after =
        (order[index]?.compareDocumentPosition(node) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING
      expect(after).toBeGreaterThan(0)
    }
  })
})
