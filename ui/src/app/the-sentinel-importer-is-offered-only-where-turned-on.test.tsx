/**
 * **The importer is offered only on an install whose operator turned it on.**
 *
 * The rail's half is `CaseFrameContainer.test.tsx`, and the pane leaving an
 * unhanded door out is `start-case-pane.test.tsx`. Here: whether the picker
 * hands the door over, and the section reached by its address, which says the
 * importer is off rather than drawing the wizard.
 */
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PickerRoute } from '@/app/picker/PickerRoute'
import { SectionOutlet } from '@/app/case/SectionOutlet'

const sentinel = vi.fn<() => boolean | undefined>()
vi.mock('@/api/importPlatforms', () => ({ useSentinelOffered: () => sentinel() }))

/** Each pane says only whether it was handed the live-source door. */
vi.mock('@/app/picker/panes', () => {
  const Pane = ({ onLiveSource }: { onLiveSource?: () => void }) => (
    <p>{onLiveSource === undefined ? 'no live source' : 'a live source'}</p>
  )
  return {
    ArchiveDoor: () => null,
    CasesPaneView: Pane,
    NewPaneView: Pane,
    DemosPaneView: Pane,
    TemplatesPaneView: Pane,
    ReportsPaneView: Pane,
    SnippetsPaneView: Pane,
    AccountsPaneView: Pane,
    AdministrationPaneView: Pane,
    LanguagesPaneView: Pane,
    ActivityPaneView: Pane,
    HealthPaneView: Pane,
  }
})
vi.mock('@/app/picker/AccountContainer', () => ({ AccountContainer: () => null }))
vi.mock('@/app/AboutContainer', () => ({ AboutContainer: () => null }))
vi.mock('@/app/picker/NewCaseContainer', () => ({ NewCaseContainer: () => null }))
vi.mock('@/api/useSession', () => ({ useSession: () => null }))
vi.mock('@/lib/useGround', () => ({
  useGround: () => ({ theme: 'system', setTheme: vi.fn() }),
}))
vi.mock('@/app/case/section-elements', () => ({
  elementFor: (slug: string | undefined) => <p>the {slug} section</p>,
}))

beforeEach(() => {
  sentinel.mockReset()
})

describe('the picker', () => {
  it.each([
    [true, 'a live source'],
    [false, 'no live source'],
    [undefined, 'no live source'],
  ])('hands the live-source door over where the install says %s', (offered, drawn) => {
    sentinel.mockReturnValue(offered)
    render(<PickerRoute />)
    expect(screen.getByText(drawn)).toBeInTheDocument()
  })
})

describe('the section at its address', () => {
  const at = () =>
    render(
      <MemoryRouter initialEntries={['/cases/c-1/import-sentinel']}>
        <Routes>
          <Route path="/cases/:caseId/:section" element={<SectionOutlet />} />
        </Routes>
      </MemoryRouter>,
    )

  it('draws the importer where the install offers it', () => {
    sentinel.mockReturnValue(true)
    at()
    expect(screen.getByText('the import-sentinel section')).toBeInTheDocument()
  })

  it('says the importer is off where the install does not offer it', () => {
    sentinel.mockReturnValue(false)
    at()
    expect(screen.getByText('Importing from Sentinel is off')).toBeInTheDocument()
    expect(screen.queryByText('the import-sentinel section')).not.toBeInTheDocument()
  })

  it('draws nothing while the install has not said', () => {
    sentinel.mockReturnValue(undefined)
    at()
    expect(screen.queryByText('the import-sentinel section')).not.toBeInTheDocument()
  })
})
