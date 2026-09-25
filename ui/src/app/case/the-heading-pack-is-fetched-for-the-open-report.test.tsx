/**
 * **The heading pack is fetched in the open report's own language.**
 *
 * Resolving headings through the served map is half the fix; the other half is
 * asking for the right map. The container pinned the query to `''` -- the
 * install's own default -- so a wired-up client would still have drawn Dutch
 * headings as English on a Dutch report, and the query key would never change
 * when the analyst changed the language. -> #513
 *
 * No module is mocked: the real container, hooks, request layer and screen,
 * against a model of the network that answers each pack in the language asked.
 *
 * **What this does not cover:** that the served endpoint answers in the asked
 * language, which is the server's and `report/render.service.ts`'s.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { setSession } from '@/api/session'
import { setTransport } from '@/api/transport'
import { campaignCase } from '@/fixtures/campaign'

import { ReportContainer } from './ReportContainer'

const CASE = campaignCase.id
const DUTCH = campaignCase.reports[0]!.id

/** What the pack answers, per language, as the server would. */
const PACKS: Record<string, string> = {
  nl: 'Managementsamenvatting',
  en: 'Executive summary',
  '': 'Executive summary',
}

const LANGUAGES = [
  { code: 'en', label: 'English', coverage: 1 },
  { code: 'nl', label: 'Nederlands', coverage: 1 },
]

/**
 * Every language a pack was asked for.
 *
 * **Two queries, and both matter.** The screen's headings follow the open
 * report; the new-report dialog's layout chips and markings follow the
 * install, because the report it is about does not exist yet and will be made
 * in the install's language. So the assertions ask what was *among* the
 * languages fetched rather than which came last.
 */
const asked: string[] = []
let kase: typeof campaignCase

const json = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  )

function server(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : input.toString(), 'http://ic.test')
  const method = init?.method ?? 'GET'
  if (url.pathname === `/api/cases/${CASE}` && method === 'GET') return json(200, kase)
  if (url.pathname === `/api/cases/${CASE}/reports/${DUTCH}` && method === 'PATCH') {
    const { language } = JSON.parse(String(init?.body)) as { language: string }
    const reports = kase.reports.map((one) =>
      one.id === DUTCH ? { ...one, language, version: one.version + 1 } : one,
    )
    kase = { ...kase, reports }
    return json(200, reports.find((one) => one.id === DUTCH))
  }
  if (url.pathname === '/api/report-layouts') {
    const language = url.searchParams.get('lang') ?? ''
    asked.push(language)
    return json(200, {
      layouts: [],
      stages: [],
      tlp: [],
      languages: LANGUAGES,
      headings: [{ key: 'heading.exec_summary', label: PACKS[language] }],
    })
  }
  if (url.pathname === '/api/report-block-kinds') return json(200, { groups: [] })
  if (url.pathname === '/api/regimes') return json(200, { enabled: false, regimes: {} })
  return json(404, { message: `unmodelled ${method} ${url.pathname}` })
}

/** The distinct languages fetched, the two queries asking one key between them. */
const languages = () => [...new Set(asked)].sort()

async function open(at: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[at]}>
        <Routes>
          <Route path="/cases/:caseId/:section" element={<ReportContainer />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  await waitFor(() => {
    expect(asked.length).toBeGreaterThan(0)
  })
}

const at = (report?: string) =>
  `/cases/${CASE}/report${report === undefined ? '' : `?report=${report}`}`

describe('the language the heading pack is fetched in', () => {
  beforeEach(() => {
    asked.length = 0
    kase = {
      ...campaignCase,
      reports: campaignCase.reports.map((one, index) => ({
        ...one,
        language: index === 0 ? 'nl' : '',
      })),
    }
    setTransport(server)
    setSession({ userId: 'u-ada', username: 'Ada' })
  })

  afterEach(() => {
    setTransport((input, init) => fetch(input, init))
  })

  it("is the open report's own", async () => {
    await open(at(DUTCH))

    await waitFor(() => {
      expect(
        languages(),
        "the pack was fetched in the install's language, so a Dutch report would draw " +
          'whatever the install happens to be set to',
      ).toEqual(['', 'nl'])
    })
  })

  /**
   * **A report carrying no language of its own takes the install's**, which is
   * what `''` asks for -- not a second default invented here.
   */
  it("is the install's where the report names none", async () => {
    await open(at(campaignCase.reports[1]!.id))

    await screen.findByRole('button', { name: /language/i })
    expect(languages()).toEqual([''])
  })

  /**
   * **The index list is not a report.** With none open there is no language to
   * follow, and the list draws what the install answers.
   */
  it("is the install's where no report is open", async () => {
    await open(at())

    expect(languages()).toEqual([''])
  })

  /**
   * **The pack has to reach the screen, not merely be fetched.** Handing the
   * screen an empty object leaves every heading drawn as its own key.
   */
  it('reaches the screen as the words the pack answered with', async () => {
    await open(at(DUTCH))

    expect(
      (await screen.findAllByText('Managementsamenvatting')).length,
      'the screen drew something other than the pack that was fetched for it',
    ).toBeGreaterThan(0)
  })

  /**
   * **Changing the language changes the words, which is the analyst's own
   * act.** The report is patched, the case is read again, and the pack the
   * screen draws from has to follow -- a screen that keeps the old language's
   * headings over a document that will export in the new one is the defect,
   * one step later.
   */
  it('follows the report when the analyst changes it', async () => {
    const user = userEvent.setup()
    await open(at(DUTCH))
    await screen.findAllByText('Managementsamenvatting')

    await user.click(screen.getByRole('button', { name: /language/i }))
    await user.click(await screen.findByRole('option', { name: 'English' }))

    await waitFor(() => {
      expect(
        screen.queryAllByText('Managementsamenvatting'),
        "the screen kept the old language's headings over a report that no longer carries it",
      ).toEqual([])
    })
    expect(screen.getAllByText('Executive summary').length).toBeGreaterThan(0)
  })
})
