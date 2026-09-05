import { useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'

import { useActivity } from '@/api/activity'
import { useAppearances } from '@/api/appearance'
import { useCase, useCaseSummary, useCases } from '@/api/case'
import { useSpecs } from '@/api/specs'
import { useCaseMutation } from '@/api/useCaseMutation'
import { CaseKeyTimesSheet } from '@/components/blocks/case-key-times-sheet'
import { announcing } from '@/app/case/entryWrites'
import { useCasePresence } from '@/api/presence'
import { SECTIONS } from '@/components/blocks/case-sections'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { useNoteVisit } from '@/api/recentCases'
import { ENTRY_SLUG } from '@/components/blocks/case-sections'
import { CaseProvidersLive } from '@/app/case/CaseProviders'
import { ChordLayerContainer } from '@/app/case/ChordLayerContainer'
import { sessionRows } from '@/components/blocks/session-menu'
import { AccountContainer } from '@/app/picker/AccountContainer'
import { AboutContainer } from '@/app/AboutContainer'
import { CheatSheetDialog } from '@/components/blocks/cheat-sheet'
import { useCaseId, useSectionName } from '@/app/useCaseId'
import { CaseFrame, switcherRows } from '@/components/blocks/case-frame'
import { useSession } from '@/api/useSession'
import { peopleFrom } from '@/components/blocks/case-presence'
import { useGround } from '@/lib/useGround'

/**
 * The case, bound to the exchange: what the frame draws, fetched.
 *
 * **`CaseFrame` is the whole of the chrome and this is the whole of the
 * wiring.** The frame composes one rail for every section of a case and knows
 * nothing about a request; this reads what is true of the case rather than of
 * the section - its name, who else is in it, what has been written to it, how
 * full each section is - and hands it over as data.
 *
 * **The pane is `<Outlet />`.** The router resolves `:section` and
 * `SectionOutlet` draws it, so this file names no screen and changes for no
 * section.
 *
 * **The two menus are rows, not menus.** `RailHeader` and `RailUser` each own
 * the trigger and the surface; what a caller supplies is what switching and
 * signing out do. They are built here rather than in a component of their own
 * because React Aria assembles a menu's rows into a collection, and a component
 * standing between the menu and its items is a node the collection has to
 * understand.
 */
export function CaseFrameContainer() {
  const caseId = useCaseId()
  const [account, setAccount] = useState(false)
  const [about, setAbout] = useState(false)
  // The chord layer binds `?` to its own copy; this is the menu's door to the
  // same sheet, for an analyst who reaches for a menu rather than a key.
  const [sheet, setSheet] = useState(false)
  // **The whole case, and only once the panel is asked for.** The five stamps
  // live on the case record, which the summary route does not carry; fetching
  // it with the frame would pull every timeline entry onto every section for a
  // panel most visits never open.
  const [keyTimes, setKeyTimes] = useState(false)
  const section = useSectionName() ?? ENTRY_SLUG
  const navigate = useNavigate()
  const kase = useCaseSummary(caseId)
  const cases = useCases()
  const activity = useActivity(caseId)
  const presence = useCasePresence(caseId)
  const appearances = useAppearances()
  const session = useSession()
  const { theme, setTheme } = useGround()
  const record = useCase(caseId, keyTimes)
  const specs = useSpecs()
  const patch = useCaseMutation(caseId)

  // **Recorded on arrival, not on the picker's click.** A case reached by a
  // pasted URL, by the switcher or by browser history is just as opened as one
  // reached from the list, and only the frame sees all four. Per section,
  // because where they were is half of what the picker's Continue means.
  useNoteVisit(caseId, section)

  // **The reference, falling back to the id.** An empty string would leave the
  // rail's head blank while the summary is in flight; the id is addressable and
  // is what the analyst has in the address bar either way.
  const caseName = kase.data?.reference ?? caseId
  const others = (cases.data ?? []).filter((one) => one.id !== caseId)

  useDocumentTitle(caseName, SECTIONS[section]?.title)

  return (
    <CaseProvidersLive caseId={caseId}>
      <CaseFrame
        section={section}
        caseName={caseName}
        {...(kase.data?.customer == null ? {} : { caseCaption: kase.data.customer })}
        switcher={switcherRows(kase.data?.title ?? caseName, others, (to) => {
          void navigate(to)
        })}
        {...(session === null
          ? {}
          : {
              user: {
                person: { name: session.username, userId: session.userId, you: true },
                menu: sessionRows(
                  session.username,
                  theme,
                  setTheme,
                  () => {
                    setAccount(true)
                  },
                  () => {
                    setSheet(true)
                  },
                  () => {
                    setAbout(true)
                  },
                ),
              },
            })}
        headerEnd={
          <CaseKeyTimesSheet
            isOpen={keyTimes}
            onOpenChange={setKeyTimes}
            kase={record.data}
            specs={specs.data}
            writes={{
              save: (field, value, version) =>
                announcing('the case', () =>
                  patch.mutateAsync({ version, fields: { [field]: value } }),
                ),
            }}
          />
        }
        people={peopleFrom(presence.roster, session?.userId, appearances.data)}
        activity={{ entries: activity.data ?? [] }}
        // **The served tally, not a derived one.** `attention` is keyed by
        // collection and the rail's slugs are those names, which is why nothing
        // sits between them - deriving the same numbers needs every timeline
        // row, and that is the whole-case read the summary route replaced.
        counts={kase.data?.attention ?? {}}
        hrefFor={(slug) => `/cases/${encodeURIComponent(caseId)}/${slug}`}
      >
        <Outlet />
      </CaseFrame>
      {/* Inside the providers and outside the frame: mounted for as long as a
          case is open, and raised over the whole of it rather than into the
          pane. */}
      <ChordLayerContainer />
      <AccountContainer isOpen={account} onOpenChange={setAccount} />
      <AboutContainer isOpen={about} onOpenChange={setAbout} />
      <CheatSheetDialog isOpen={sheet} onOpenChange={setSheet} />
    </CaseProvidersLive>
  )
}
