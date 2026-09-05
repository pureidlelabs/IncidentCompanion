import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AriaRouter } from '@/components/ui/aria-router'
import { ExportCsvButton } from './export-csv-button'

/**
 * The shared door every table's CSV export goes through.
 *
 * The whole point of the control is that **the browser** performs the
 * download: the session cookie rides a same-origin navigation, and a refused
 * request saves its JSON refusal under the `.csv` name rather than vanishing.
 * Every way that can be taken away is one of these.
 */
describe('the export door stays a download the browser performs', () => {
  it('is an anchor, so the browser owns the navigation', () => {
    render(<ExportCsvButton href="/api/cases/x/systems.csv" filename="systems.csv" />)
    expect(screen.getByRole('link', { name: /Export CSV/ }).tagName).toBe('A')
  })

  it('carries `download` with the filename the caller gave', () => {
    render(<ExportCsvButton href="/api/cases/x/systems.csv" filename="systems.csv" />)
    expect(screen.getByRole('link', { name: /Export CSV/ })).toHaveAttribute(
      'download',
      'systems.csv',
    )
  })

  it('carries the href it was handed, unrewritten', () => {
    render(<ExportCsvButton href="/api/cases/x/systems.csv" filename="systems.csv" />)
    expect(screen.getByRole('link', { name: /Export CSV/ })).toHaveAttribute(
      'href',
      '/api/cases/x/systems.csv',
    )
  })

  /**
   * **The defect the move to React Aria could have introduced, and the reason
   * this file exists.**
   *
   * `AriaRouter` is mounted app-wide (`ui/src/app/aria-routing.tsx`), and a
   * `RouterProvider` hands every nested React Aria link to the router's
   * `navigate`. A client-side route to `/api/.../systems.csv` renders a
   * not-found screen and downloads nothing - and the failure is invisible to
   * every other assertion here, because the anchor, the `href` and the
   * `download` attribute are all still correct.
   *
   * React Aria's own rule is `!link.hasAttribute('download')` in
   * `shouldClientNavigate`, so this holds as long as the attribute is set.
   * Drop `download` and this goes red for the same reason the download breaks.
   */
  it('is not taken by the client-side router', async () => {
    const navigate = vi.fn<(path: string) => void>()
    render(
      <AriaRouter navigate={navigate}>
        <ExportCsvButton href="/api/cases/x/systems.csv" filename="systems.csv" />
      </AriaRouter>,
    )

    await userEvent.click(screen.getByRole('link', { name: /Export CSV/ }))

    expect(navigate, 'the router swallowed the download').not.toHaveBeenCalled()
  })
})
