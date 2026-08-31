import { Navigate, createBrowserRouter } from 'react-router-dom'

import { withAriaRouting } from './aria-routing'
import { RouteError, SectionError } from './RouteError'

import { PickerRoute } from '@/app/picker/PickerRoute'
import { CaseFrameContainer } from '@/app/case/CaseFrameContainer'
import { SectionOutlet } from '@/app/case/SectionOutlet'
import { ENTRY_SLUG } from '@/components/blocks/case-sections'

/**
 * The route shape every screen plugs into.
 *
 *     /                          -> redirect to /cases
 *     /cases                     the picker
 *     /cases/:caseId             -> redirect to its first section
 *     /cases/:caseId/:section    one section of one case
 *
 * **The case id lives in the URL, not in a prop and not in a context.**
 * `useCaseId()` reads it from the route, so a section takes no case prop.
 * Context-only was rejected: it fixes the drilling and leaves the app with no
 * addressable state at all - no reload, no bookmark, no back button, and no
 * way for one section to link to another, which two cross-referencing sections
 * already need.
 *
 * **A dialog is still not a URL.** A section is where you are, a dialog is
 * something you are doing; dialog state stays in the component that owns it.
 *
 * **The basename is `import.meta.env.BASE_URL`, never a literal.** Hardcode the
 * prefix and every route falls through to the `*` redirect while every asset
 * loads - a working shell showing the wrong screen.
 *
 * `:section` is a plain string rather than a union of `CollectionName`:
 * sections are not one-to-one with tables, so a union would be a third list to
 * keep true. `SectionOutlet` resolves it and owns the not-found answer.
 */
export const router = createBrowserRouter(
  withAriaRouting([
    { path: '/', element: <Navigate to="/cases" replace /> },
    { path: '/cases', element: <PickerRoute />, errorElement: <RouteError /> },
    // Declared before the `*` catch-all, which would otherwise redirect it to
    // the picker - a route that loads the whole bundle and shows the wrong
    // screen with a clean network tab.
    {
      path: '/cases/:caseId',
      element: <CaseFrameContainer />,
      // **On the shell and on the section, both.** A throw in the shell takes
      // the rail with it and there is nothing left to navigate from; a throw
      // in a section should not. The inner one keeps the rail and replaces
      // only the pane, which is the difference between "one screen is broken"
      // and "the app is gone". -> `RouteError`
      errorElement: <RouteError />,
      children: [
        { index: true, element: <Navigate to={ENTRY_SLUG} replace /> },
        { path: ':section', element: <SectionOutlet />, errorElement: <SectionError /> },
      ],
    },
    { path: '*', element: <Navigate to="/cases" replace /> },
  ]),
  { basename: import.meta.env.BASE_URL },
)
