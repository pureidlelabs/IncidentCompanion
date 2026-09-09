/**
 * The menu offers signing out only where there is something to sign out of.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { Button } from '@/components/ui/button'
import { Menu, MenuTrigger } from '@/components/ui/menu'

import { sessionRows } from './session-menu'

function rows(canSignOut?: boolean) {
  const noop = () => undefined
  return canSignOut === undefined
    ? sessionRows('r.okonkwo', 'system', noop, noop, noop, noop)
    : sessionRows('r.okonkwo', 'system', noop, noop, noop, noop, canSignOut)
}

async function open(items: ReturnType<typeof rows>) {
  render(
    <MenuTrigger>
      <Button>Session menu</Button>
      <Menu aria-label="Session">{items}</Menu>
    </MenuTrigger>,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Session menu' }))
  await screen.findByRole('menu')
}

describe('the session menu', () => {
  it('offers Sign out for an account', async () => {
    await open(rows())
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('offers no Sign out where nothing signs out, which is the evaluation build', async () => {
    await open(rows(false))
    expect(screen.queryByRole('menuitem', { name: 'Sign out' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'About IncidentCompanion' })).toBeInTheDocument()
  })
})
