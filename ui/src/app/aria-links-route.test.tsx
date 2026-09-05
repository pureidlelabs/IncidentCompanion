/**
 * A React Aria link navigates the router, rather than the browser.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link } from 'react-aria-components'
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { withAriaRouting } from './aria-routing'

/** The address bar, as the router sees it. */
function Where() {
  const { pathname, search } = useLocation()
  return <span data-testid="where">{`${pathname}${search}`}</span>
}

function Start() {
  return (
    <>
      <Where />
      <Link href="/cases/c1/timeline?step=impact">the pivot</Link>
    </>
  )
}

function routerFor(routes: Parameters<typeof createMemoryRouter>[0]) {
  return createMemoryRouter(routes, { initialEntries: ['/'] })
}

describe('a React Aria link inside the app router', () => {
  it('changes the route rather than leaving the page', async () => {
    const user = userEvent.setup()
    const router = routerFor(
      withAriaRouting([
        { path: '/', element: <Start /> },
        { path: '/cases/:caseId/:section', element: <Where /> },
      ]),
    )
    render(<RouterProvider router={router} />)

    await user.click(screen.getByRole('link', { name: 'the pivot' }))

    // The route moved. Under a plain anchor jsdom refuses the navigation and
    // the location never changes, which is the defect this holds shut.
    expect(screen.getByTestId('where')).toHaveTextContent('/cases/c1/timeline?step=impact')
  })

  it('wraps every route rather than one of them', () => {
    // The provider is a pathless layout route, so a route added later is
    // covered without anybody remembering to wrap it.
    //
    // **Three routes, because one cannot tell the claim from its opposite.**
    // With a single-route fixture, wrapping only the first is identical to
    // wrapping all of them, and this assertion passed a mutation that left
    // every route after the first outside the provider.
    const wrapped = withAriaRouting([
      { path: '/a', element: <Where /> },
      { path: '/b', element: <Where /> },
      { path: '/c', element: <Where /> },
    ])
    expect(wrapped).toHaveLength(1)
    expect(wrapped[0]?.path).toBeUndefined()
    expect(wrapped[0]?.children?.map((one) => one.path)).toEqual(['/a', '/b', '/c'])
  })
})
