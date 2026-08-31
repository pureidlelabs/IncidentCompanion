/**
 * React Aria's links, given a navigate function.
 *
 * **Router-agnostic on purpose.** The kit owns the `react-aria-components`
 * import -- `kit-owns-the-primitives.rule.test.ts` refuses that import
 * anywhere else -- and the app owns which router is mounted. So the two
 * functions arrive as props rather than as a `react-router` import here.
 *
 * **Without this a React Aria `Link` with an `href` is a plain anchor**, so
 * the browser navigates and the app unmounts. React Aria's own words: the
 * provider "provides it to all nested React Aria links to enable client side
 * navigation". It reaches `Link`, `Tab`, `MenuItem` and a row's `onAction`,
 * not only anchors.
 *
 * `useHref` is not optional where the router carries a basename: without it
 * React Aria hands the raw path to `navigate` and the base is dropped.
 */
import type { ReactNode } from 'react'
import { RouterProvider } from 'react-aria-components'

export interface AriaRouterProps {
  /** The router's navigate. Must return void; void a promise at the call site. */
  navigate: (path: string, options?: unknown) => void
  /** The router's `useHref`, so a basename reaches the link. */
  useHref?: ((href: string) => string) | undefined
  children: ReactNode
}

export function AriaRouter({ navigate, useHref, children }: AriaRouterProps) {
  return (
    <RouterProvider navigate={navigate} {...(useHref ? { useHref } : {})}>
      {children}
    </RouterProvider>
  )
}
