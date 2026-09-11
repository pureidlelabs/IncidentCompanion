/**
 * **What the container approves, which is the seam nothing looked at.**
 *
 * The server writes a proposed row only when its own candidate id is in
 * `approved` -- ids it builds from the incident and the row's identity, and
 * hands back on the preview. The container sent the *incident* keys, so
 * nothing ever matched: the commit answered `201` with
 * `{entities: 0, timeline: 0}`, the case gained nothing, and the screen
 * reported the number of rows it had proposed. -> #382
 *
 * Neither neighbouring tier can see it. The screen is driven with a stub
 * writer, so this body never runs there; the server's own tests post an
 * `approved` list no wizard built, and agree with it because it was derived
 * from the same plan.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import {
  MemoryRouter,
  Route,
  RouterProvider,
  Routes,
  createMemoryRouter,
} from 'react-router-dom'
import type * as React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * **The whole call, not one argument of it.**
 *
 * Recording `approved` alone left the payload asserted by nothing, and a
 * commit posting an empty incident list passed every case in this file --
 * an import that writes nothing, which is the defect the branch is named
 * for. Both are held now, and the payload by identity rather than by shape.
 */
const commits: { payload: { incidents: unknown[] }; approved: string[] }[] = []
/** Every one-act create the container made, in the order it made them. */
const starts: {
  payload: { incidents: unknown[] }
  approved: string[]
  kase: Record<string, unknown>
}[] = []
/** The payloads the preview was given, so a commit can be held to one of them. */
const previews: { incidents: unknown[] }[] = []

/**
 * What the server answers, and none of it derivable from what was approved.
 *
 * **Three distinct numbers, on purpose.** A commit mock that returns
 * `approved.length` lets a container compute the same answer off the plan it
 * already holds and never read the response -- which is the defect this file
 * exists to refuse, one layer below where the screen looks for it.
 */
const WROTE = { entities: 7, timeline: 5, skippedExisting: 3 }

/**
 * The one incident the provider lists, carrying what a case is seeded from.
 *
 * `firstActivity` and not `created`: the second is formatted for the table and
 * the first is the one the provider compares on, so a case seeded from the
 * wrong one is off by however the table chose to render it.
 */
const INCIDENT = {
  key: 'SEN-1001',
  number: 'INC-88213',
  title: 'A phish',
  firstActivity: '2026-07-30T08:55:00Z',
}

/**
 * Two rows a preview proposes, keyed as the server keys them.
 *
 * **The separators are escapes and not the characters themselves.** `SEPARATOR`
 * is `\u001F` and the identity joins on `\u0000`; typed literally they are
 * invisible in every tool that prints this file, so an edit that lands beside
 * one reads as correct and is not. -> `tests/repo/test_source_hygiene.py`
 *
 * **And the shape the server sends, not the fields this file happens to
 * read.** `forReview` maps `incident`, `label` and `verdict`, and an earlier
 * fixture carried none of them: the mock factory is untyped, so `tsc` said
 * nothing, and the screen is a recorder that renders nothing, so the mapping
 * was exercised against a shape no server produces.
 */
const PREVIEW = {
  entities: [
    {
      id: 'SEN-1001\u001Fsystems\u0000wks-0142',
      incident: 'SEN-1001',
      collection: 'systems',
      label: 'wks-0142',
      verdict: 'new' as const,
      fields: { hostname: 'wks-0142' },
      existing: null,
      checked: true,
    },
    {
      id: 'SEN-1001\u001Faccounts\u0000r.okonjo',
      incident: 'SEN-1001',
      collection: 'accounts',
      label: 'r.okonjo',
      verdict: 'existing' as const,
      fields: { username: 'r.okonjo' },
      existing: 'a-row-the-case-holds',
      checked: true,
    },
  ],
  /**
   * **A timeline row, which the review is never shown.** The server filters
   * both halves against the same approved set, so a commit that carries only
   * the entity ids imports a case's assets and none of its events -- and with
   * an empty timeline here, nothing would say so. -> #392
   */
  timeline: [
    {
      id: 'SEN-1001\u001Ftimeline\u0000alert\u0000a-9f2',
      incident: 'SEN-1001',
      collection: 'timeline',
      label: 'A phish was reported',
      verdict: 'new' as const,
      fields: { summary: 'A phish was reported' },
      existing: null,
      checked: true,
    },
  ],
}

/** Every row the preview proposes, whichever list it arrived in. */
const EVERY_ROW = [...PREVIEW.entities, ...PREVIEW.timeline].map((one) => one.id)

const WORKSPACE = { key: 'ws-1', name: 'aurora-soc', group: 'aurora' }

const provider = {
  connect: () => Promise.resolve({ identity: 'analyst', token: 't' }),
  listSources: () => Promise.resolve({ sources: [WORKSPACE] }),
  listIncidents: () => Promise.resolve({ incidents: [INCIDENT] }),
  fetchDetail: () => Promise.resolve({ raw: { alerts: [], entities: [] } }),
}

/** Mutable, so a case changing under a mounted wizard can be driven. */
let openCase = 'case-1'
/**
 * **The case arrives through the route, not through a mocked hook.** The
 * container reads `useParams` so it can also be mounted where there is no case
 * yet -- the door that makes one -- and a stubbed hook would leave the
 * case-boundary guard below comparing two empty strings and passing.
 *
 * Held so a test can move between cases the way the app does: the path is the
 * same, so the element is re-rendered rather than remounted and the ref
 * holding the reviewed plan survives -- which is the whole point of the guard.
 */
let router: ReturnType<typeof createMemoryRouter> | null = null

function inCase(node: React.ReactNode) {
  router = createMemoryRouter(
    [{ path: '/cases/:caseId/import-sentinel', element: node }],
    { initialEntries: [`/cases/${openCase}/import-sentinel`] },
  )
  return withClient(<RouterProvider router={router} />)
}

/**
 * The container invalidates the case list after making one, as every other
 * path that mints a case does, so it needs a client to invalidate on.
 */
function withClient(node: React.ReactNode) {
  return <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>
}
vi.mock('@/api/sentinel/armSource', () => ({ armSource: () => provider }))
vi.mock('@/api/sentinel/msalTokenProvider', () => ({ msalTokenProvider: () => ({}) }))
vi.mock('@/api/sentinel/demoSource', () => ({ demoSourceFromUrl: () => provider }))
vi.mock('@/api/incidentImport', () => ({
  previewImport: (_caseId: string, payload: { incidents: unknown[] }) => {
    previews.push(payload)
    return Promise.resolve(PREVIEW)
  },
  commitImport: (
    _caseId: string,
    payload: { incidents: unknown[] },
    decision: { approved: string[] },
  ) => {
    commits.push({ payload, approved: [...decision.approved] })
    return Promise.resolve(WROTE)
  },
  startCaseFromIncident: (
    payload: { incidents: unknown[] },
    decision: { approved: string[] },
    kase: Record<string, unknown>,
  ) => {
    starts.push({ payload, approved: [...decision.approved], kase })
    return Promise.resolve({ ...WROTE, caseId: 'case-made' })
  },
}))

interface Writes {
  connect: (registration: unknown) => Promise<unknown>
  sources: () => Promise<unknown>
  incidents: (sourceId: string, dials: Record<string, unknown>) => Promise<unknown>
  preview: (sourceId: string, ids: readonly string[]) => Promise<readonly { id: string }[]>
  commit: (
    sourceId: string,
    ids: readonly string[],
    approved: readonly string[],
  ) => Promise<unknown>
  create?: (
    sourceId: string,
    ids: readonly string[],
    kase: { title: string },
    approved: readonly string[],
  ) => Promise<{ caseId: string }>
}

/** The screen, reduced to a handle on the `writes` it is given. */
let writes: Writes | null = null
vi.mock('@/screens/import-sentinel', () => ({
  ImportSentinelScreen: (props: { writes: Writes }) => {
    writes = props.writes
    return null
  },
}))

const { ImportSentinelContainer } = await import('./ImportSentinelContainer')

/**
 * Walk the wizard as far as a commit needs it.
 *
 * **The preview is part of that walk now.** The commit writes the plan the
 * review was given rather than reading the provider a second time, so a
 * container reached without one has nothing approved and refuses.
 */
async function ready(): Promise<Writes> {
  // Cleared per case: both are module-level, so a second render that never
  // reached the screen would otherwise be handed the first one's writes.
  writes = null
  commits.length = 0
  previews.length = 0
  render(inCase(<ImportSentinelContainer />))
  await waitFor(() => {
    expect(writes, 'the screen was never handed its writes').not.toBeNull()
  })
  const held = writes!
  await held.connect({})
  await held.sources()
  await held.incidents(WORKSPACE.key, {
    severity: [],
    status: [],
    title: '',
    number: '',
    sinceHours: '0',
  })
  await held.preview(WORKSPACE.key, ['SEN-1001'])
  return held
}

/**
 * The same walk, through the door that makes the case it fills.
 *
 * Mounted with no case at all, which is the state that door is for -- so the
 * boundary key the guards below are built on degenerates to the incident ids,
 * and every property `commit` is held to has to be re-established here rather
 * than assumed to carry over.
 */
async function readyToStart(): Promise<Writes> {
  writes = null
  starts.length = 0
  previews.length = 0
  render(
    withClient(
      <MemoryRouter initialEntries={['/cases']}>
        <Routes>
          <Route path="/cases" element={<ImportSentinelContainer startsACase />} />
        </Routes>
      </MemoryRouter>,
    ),
  )
  await waitFor(() => {
    expect(writes, 'the screen was never handed its writes').not.toBeNull()
  })
  const held = writes!
  await held.connect({})
  await held.sources()
  await held.incidents(WORKSPACE.key, {
    severity: [],
    status: [],
    title: '',
    number: '',
    sinceHours: '0',
  })
  await held.preview(WORKSPACE.key, ['SEN-1001'])
  return held
}

describe('the Sentinel import container', () => {
  beforeEach(() => {
    commits.length = 0
    starts.length = 0
    previews.length = 0
    writes = null
    openCase = 'case-1'
  })

  /**
   * **The preview answers two lists and the write covers both**, so a review
   * given one of them has the analyst approving a smaller picture than the
   * import. A timeline entry carries no verdict and no collection of its own
   * -- the server matches an entity against the case and a timeline row
   * against nothing -- so it is mapped rather than dropped. -> #392
   */
  it('offers every row the import would write, timeline entries included', async () => {
    const held = await ready()
    const proposed = await held.preview(WORKSPACE.key, ['SEN-1001'])

    expect(
      proposed.map((one) => one.id),
      'a row the import would write that the analyst never saw',
    ).toEqual(EVERY_ROW)
  })

  /**
   * **A declined row is not written**, which is the whole of what the ticks
   * are for. The commit carries the analyst's subset rather than everything
   * proposed, and nothing downstream may widen it back. -> #377
   */
  it('approves exactly the rows it was handed, and no others', async () => {
    const held = await ready()
    const declined = PREVIEW.entities[1]!.id
    const kept = EVERY_ROW.filter((id) => id !== declined)
    await held.commit(WORKSPACE.key, ['SEN-1001'], kept)

    expect(commits.at(-1)?.approved, 'a declined row was written anyway').not.toContain(declined)
    expect(commits.at(-1)?.approved).toEqual(kept)
  })

  it('approves the candidate ids the preview named, not the incident keys', async () => {
    const held = await ready()
    await held.commit(WORKSPACE.key, ['SEN-1001'], EVERY_ROW)

    /**
     * **The composite, not the key.** `SEN-1001` is what the picker selects
     * and what the provider is asked for. It is never a candidate id, and a
     * commit carrying it approves nothing at all.
     */
    expect(commits.at(-1)?.approved, 'the commit approved incident keys').toEqual([
      ...PREVIEW.entities.map((one) => one.id),
      ...PREVIEW.timeline.map((one) => one.id),
    ])
  })

  /**
   * **The rows the review was drawn from, and not a second reading.**
   *
   * `commit` used to fetch every incident again and post that: the plan the
   * analyst read came from one read of the provider and the body from
   * another, so anything gained in between was written having never been on
   * screen. Held by identity rather than by shape, because two reads of the
   * same unchanged incident are equal and are still two reads.
   */
  it('posts the payload the review was drawn from, not a second reading', async () => {
    const held = await ready()
    await held.commit(WORKSPACE.key, ['SEN-1001'], EVERY_ROW)

    expect(previews, 'the review was drawn from no payload at all').toHaveLength(1)
    expect(
      commits.at(-1)?.payload.incidents,
      'the commit read the provider again instead of writing what was reviewed',
    ).toHaveLength(previews[0]!.incidents.length)
    expect(
      commits.at(-1)?.payload,
      'the committed body is a different object from the reviewed one',
    ).toBe(previews[0])
    expect(
      commits.at(-1)?.payload.incidents.length,
      'the commit posted no incidents at all, so nothing could be written',
    ).toBeGreaterThan(0)
  })

  /**
   * **The answer, passed through untouched.** `WROTE` shares no number with
   * the plan, so a container that counts its own approvals -- or its own
   * proposal -- cannot arrive at it.
   */
  it('answers with what the server wrote, so nothing downstream can overstate it', async () => {
    const held = await ready()
    const answered = await held.commit(WORKSPACE.key, ['SEN-1001'], EVERY_ROW)

    expect(
      answered,
      'the commit answered a number it worked out rather than the one it was given',
    ).toEqual(WROTE)
  })

  /**
   * **A plan belongs to the case it was reviewed against.**
   *
   * The wizard holds the reviewed plan for as long as it is mounted, and the
   * case it writes into is read fresh on every render. Nothing routes between
   * two cases without unmounting this component today, so this is a guard
   * against the router changing rather than against a screen anyone can
   * drive -- which is the reason to hold it in a test rather than in a
   * sentence.
   */
  it('refuses a plan reviewed against another case', async () => {
    await ready()
    commits.length = 0

    // Navigated rather than re-rendered: the ref holding the reviewed plan
    // belongs to the mounted component, and a fresh tree would not have it.
    openCase = 'case-2'
    await act(async () => {
      await router!.navigate(`/cases/${openCase}/import-sentinel`)
    })
    await waitFor(() => {
      expect(writes, 'the navigation handed the screen no writes').not.toBeNull()
    })

    await expect(writes!.commit(WORKSPACE.key, ['SEN-1001'], EVERY_ROW)).rejects.toThrow(
      /Review the rows/,
    )
    expect(commits, 'one case`s approvals were written into another').toHaveLength(0)
  })

  /**
   * **The rows the review was given, not a second reading of the provider.**
   *
   * Committing a selection the review never saw would write rows nobody was
   * shown, which `openspec/specs/incident-import/spec.md` refuses. It is
   * refused rather than previewed on the analyst's behalf.
   */
  it('refuses to write a selection the review was never given', async () => {
    const held = await ready()

    await expect(held.commit(WORKSPACE.key, ['SEN-1001', 'SEN-2002'], EVERY_ROW)).rejects.toThrow(
      /Review the rows/,
    )
    expect(commits, 'a selection nobody reviewed reached the server').toHaveLength(0)
  })

  /**
   * **The door that makes a case is a second write path, so it owes the same
   * proofs.** Every property above was re-implemented on it rather than
   * shared, and the guard it re-implements is the one #382 was filed for.
   */
  describe('the ending that makes the case it fills', () => {
    it('approves the candidate ids the preview named, not the incident keys', async () => {
      const held = await readyToStart()

      await held.create!(WORKSPACE.key, ['SEN-1001'], { title: 'From an incident' }, EVERY_ROW)

      expect(starts, 'the one-act create never reached the server').toHaveLength(1)
      expect(starts[0]?.approved).toEqual([...EVERY_ROW])
      expect(starts[0]?.approved).not.toContain('SEN-1001')
    })

    it('sends the title it was given, and the incident`s own reference and time', async () => {
      const held = await readyToStart()

      await held.create!(WORKSPACE.key, ['SEN-1001'], { title: 'From an incident' }, EVERY_ROW)

      expect(starts[0]?.kase.title).toBe('From an incident')
      // The provider's, not the browser's clock: a case opened at `now` loses
      // when the incident actually started.
      expect(starts[0]?.kase.reference).toBe(INCIDENT.number)
      expect(starts[0]?.kase.detectedAt).toBe(INCIDENT.firstActivity)
    })

    it('refuses to create from a selection the review was never given', async () => {
      const held = await readyToStart()

      await expect(
        held.create!(WORKSPACE.key, ['SEN-1001', 'SEN-2002'], { title: 'x' }, EVERY_ROW),
      ).rejects.toThrow(/Review the rows/)
      expect(starts, 'a selection nobody reviewed made a case').toHaveLength(0)
    })

    it('gives the importer inside a case no way to create one', async () => {
      const held = await ready()
      expect(held.create, 'the in-case importer was handed a create it must never call').toBe(
        undefined,
      )
    })
  })
})
