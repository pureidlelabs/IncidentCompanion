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
 * `useHref` shapes the rendered `href` attribute and nothing else: `navigate`
 * receives the raw path either way, so without it the base is missing from
 * what a copy-link or a middle-click targets rather than from the navigation.
 */
import type { ReactNode } from 'react'
import { RouterProvider } from 'react-aria-components'

/**
 * What a kit link may ask of whatever router is mounted.
 *
 * React Aria types `routerOptions` through a module augmentation that is empty
 * until somebody declares one, so without this the prop is `never` and every
 * use of it is refused. Router-agnostic like the rest of this file: `replace`
 * is the one option a row here needs, and every router spells it the same way.
 */
declare module 'react-aria-components' {
  interface RouterConfig {
    routerOptions: { replace?: boolean }
  }
}

export interface AriaRouterProps {
  /** The router's navigate. Must return void; void a promise at the call site. */
  navigate: (path: string, options?: unknown) => void
  /** The router's `useHref`, so a basename reaches the link. */
  useHref?: ((href: string) => string) | undefined
  children: ReactNode
}

/**
 * Whether this href addresses something other than a route in this app.
 *
 * A scheme, or protocol-relative. Everything else is a path, which is what a
 * router resolves against its base.
 */
function addressesSomethingElse(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')
}

/**
 * The router's `useHref`, applied to routes and to nothing else.
 *
 * **React Aria puts every link's href through it**, including the ones that are
 * not routes -- and a router resolves anything without a scheme as a path, so
 * `data:text/csv,...` renders as `/data:text/csv,...` and the download asks for
 * a path no server has. The CSV templates and both indicator exports are
 * `data:`; a `mailto:` or an external advisory would go the same way. -> #519
 *
 * Here rather than at each caller, because a caller that forgets is a surface
 * whose links resolve differently -- which is what the app and the gallery did.
 *
 * The returned function is a hook, which is what React Aria asks for and why it
 * is named as one: the router's own is called for every href, and what changes
 * is whether its answer is used.
 */
function routeOnly(useHref: (href: string) => string): (href: string) => string {
  return function useRouteHref(href: string): string {
    const resolved = useHref(href)
    return addressesSomethingElse(href) ? href : resolved
  }
}

export function AriaRouter({ navigate, useHref, children }: AriaRouterProps) {
  return (
    <RouterProvider
      navigate={navigate}
      {...(useHref ? { useHref: routeOnly(useHref) } : {})}
    >
      {children}
    </RouterProvider>
  )
}
