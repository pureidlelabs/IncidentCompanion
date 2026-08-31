import type { Decorator } from '@storybook/react-vite'
import { ShieldAlert } from 'lucide-react'
import { MemoryRouter } from 'react-router-dom'

import { CaseProviders, NO_CLAIMS } from '@/app/case/CaseProviders'
import { CaseFrame } from '@/components/blocks/case-frame'
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
 */
export function inACase(section: string): Decorator {
  // Named, because the lint refuses an anonymous component and a decorator
  // returns one -- and the name is what Storybook shows in the component stack.
  const InACase: Decorator = (Story) => (
    <MemoryRouter initialEntries={[`/cases/${campaignCase.id}/${section}`]}>
      {/* **The app's own case stack, not a second one.** This supplied
          `EntityCardProvider` alone while the app wrapped the same screens in
          attribution, claims and the section-action registry -- so a story
          showed a row with no "edited 2m ago" and no claim, which is the
          multi-user half of the product missing from the gallery meant to show
          it. `live` is off: there is no socket here and nothing to repaint. */}
      <CaseProviders caseId={campaignCase.id} claims={NO_CLAIMS}>
        <div className="h-dvh">
          <CaseFrame
            section={section}
            {...caseChrome}
            activity={{ entries: caseActivity(Math.floor(GALLERY_NOW / 1000)) }}
            counts={FIXTURE_COUNTS}
          >
            <Story />
          </CaseFrame>
        </div>
      </CaseProviders>
    </MemoryRouter>
  )
  return InACase
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
