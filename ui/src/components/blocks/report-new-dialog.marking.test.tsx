/**
 * **The marking list as the server serves it.** The registry leads its
 * vocabulary with `''`, and the dialog draws its own Unmarked row for the same
 * key.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'

import { DEMO_LAYOUTS } from '@/components/blocks/report-layouts'
import served from '@/demo/catalogue/report-layouts.json'

import { ReportNewDialog } from './report-new-dialog'

it('offers Unmarked once when the served vocabulary carries the empty marking', async () => {
  expect(served.tlp, 'the fixture no longer serves the empty marking').toContain('')
  const user = userEvent.setup()
  render(
    <ReportNewDialog
      open
      onOpenChange={() => undefined}
      layouts={DEMO_LAYOUTS}
      markings={served.tlp}
      onCreate={() => undefined}
    />,
  )

  await user.click(screen.getByRole('button', { name: /marking/i }))
  const options = within(await screen.findByRole('listbox')).getAllByRole('option')

  expect(options.map((one) => one.textContent)).toEqual([
    'Unmarked',
    ...served.tlp.filter((one) => one !== ''),
  ])
})
