import { Navigate, createBrowserRouter } from 'react-router-dom'

import { withAriaRouting } from './aria-routing'
import { RouteError, SectionError } from './RouteError'

import { PickerRoute } from '@/app/picker/PickerRoute'
import { CaseFrameContainer } from '@/app/case/CaseFrameContainer'
import { SectionOutlet } from '@/app/case/SectionOutlet'
import { ENTRY_SLUG } from '@/components/blocks/case-sections'

/**
 * The route shape every screen plugs into.
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
