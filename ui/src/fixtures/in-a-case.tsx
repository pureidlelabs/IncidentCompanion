import type { Decorator } from '@storybook/react-vite'
import { ShieldAlert } from 'lucide-react'
import { MemoryRouter, useHref, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'

import type { RailReport } from '@/api/case'
import { CaseProviders, NO_CLAIMS } from '@/app/case/CaseProviders'
import { CaseFrame } from '@/components/blocks/case-frame'
import { AriaRouter } from '@/components/ui/aria-router'
import { campaignCase } from '@/fixtures/campaign'
import { caseActivity, caseChrome } from '@/fixtures/caseChrome'

/**
 * A screen shown the way an analyst meets it: inside the case.
 *
 * **One decorator, because twelve stories were writing their own.** Each wrote
 * the same `MemoryRouter` and `EntityCardProvider` with its own path, and the
 * twenty-three that did not simply rendered a section with no chrome around
 * it. Neither could show a page, so the rail could not be judged and moving it
 * would have reached nothing.
 *
 * **The counts are the fixture's, so the rail is a real one.** A rail whose
 * every row is bare reads as a case with nothing in it, which is the one state
 * a gallery should not default to.
 *
 * Pass the slug the screen belongs to. Everything else -- which rows exist,
 * what they are called, where the current one is -- comes from
 * `app/case-sections`, and a story says nothing about any of it.
 *
 * **The reports on the rail are the story's own where it has any, and the
 * fixture's otherwise**, for the same reason the counts are: a rail drawn
 * against nothing reads as a case that has produced nothing, and every section
 * would show that while the pane beside it listed four documents. -> #518
 */
export function inACase(section: string): Decorator {
  // Named, because the lint refuses an anonymous component and a decorator
  // returns one -- and the name is what Storybook shows in the component stack.
  const InACase: Decorator = (Story, { args }) => {
    // The report section's own args, which no other section has. A story that
    // sets neither gets the fixture's reports and the index.
    const own = args as { reports?: readonly RailReport[]; openId?: string | null }
    return (
      <MemoryRouter initialEntries={[`/cases/${campaignCase.id}/${section}`]}>
        {/* **The app's own case stack, not a second one.** This supplied
            `EntityCardProvider` alone while the app wrapped the same screens in
            attribution, claims and the section-action registry -- so a story
            showed a row with no "edited 2m ago" and no claim, which is the
            multi-user half of the product missing from the gallery meant to show
            it. `live` is off: there is no socket here and nothing to repaint. */}
        <CaseProviders caseId={campaignCase.id} claims={NO_CLAIMS}>
          <div className="h-dvh">
            <Routed>
              <CaseFrame
                section={section}
                {...caseChrome}
                activity={{ entries: caseActivity(Math.floor(GALLERY_NOW / 1000)) }}
                counts={FIXTURE_COUNTS}
                reports={own.reports ?? campaignCase.reports}
                openReport={own.openId ?? null}
                hrefFor={(slug) => `/cases/${campaignCase.id}/${slug}`}
              >
                <Story />
              </CaseFrame>
            </Routed>
          </div>
        </CaseProviders>
      </MemoryRouter>
    )
  }
  return InACase
}

/**
 * The rail's links, given the story's router.
 *
 * **Without it a rail row is a plain anchor**, so a click in the gallery is a
 * whole-page navigation out of the story rather than a move inside it. The app
 * mounts this provider around every route; a story that mounts the same rail
 * and not the provider is a rail that behaves differently in the one place it
 * can be looked at. -> `components/ui/aria-router`
 *
 * **`useHref` as well, which is what the app passes.** A story that left it off
 * is a gallery whose links resolve differently from the app's. -> #519
 */
function Routed({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  return (
    <AriaRouter
      navigate={(path, options) => {
        void navigate(path, options as never)
      }}
      useHref={useHref}
    >
      {children}
    </AriaRouter>
  )
}

/**
 * The moment the gallery's activity feed is read at.
 *
 * Fixed, so a screenshot taken in a year shows the same reading as one taken
 * today - which is what the Picture screen's own stories hold their clock at.
 */
const GALLERY_NOW = Date.parse('2026-08-19T09:00:00.000Z')

/**
 * What the campaign fixture holds, per section.
 *
 * Read from the fixture rather than typed out, so a demo case that grows does
 * not leave the rail claiming an old number.
 */
const FIXTURE_COUNTS: Readonly<Record<string, number>> = {
  timeline: campaignCase.timeline.length,
  evidence: campaignCase.evidence.length,
  entities: campaignCase.systems.length + campaignCase.accounts.length,
  impact: campaignCase.impact.length,
  actions: campaignCase.actions.length,
  notes: campaignCase.casenotes.length,
}

/**
 * The same case, with no chrome.
 *
 * For a story judging one control rather than the page -- an empty state, a
 * narrow pane, a dialog. `ShieldAlert` is imported by the frame's own header
 * and re-exported here so a story wanting a bare pane takes one import.
 */
export const bareInACase: Decorator = (Story) => (
  <MemoryRouter initialEntries={[`/cases/${campaignCase.id}/`]}>
    <CaseProviders caseId={campaignCase.id} claims={NO_CLAIMS}>
      <Story />
    </CaseProviders>
  </MemoryRouter>
)

export { ShieldAlert }
