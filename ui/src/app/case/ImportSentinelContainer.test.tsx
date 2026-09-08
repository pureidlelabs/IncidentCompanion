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
import { render, waitFor } from '@testing-library/react'
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
 * Two rows a preview proposes, keyed as the server keys them.
 *
 * **The separators are escapes and not the characters themselves.** `SEPARATOR`
 * is `\u001F` and the identity joins on `\u0000`; typed literally they are
 * invisible in every tool that prints this file, so an edit that lands beside
 * one reads as correct and is not. -> `tests/repo/test_source_hygiene.py`
 */
/**
 * **The shape the server sends, not the fields this file happens to read.**
 *
 * `forReview` maps `incident`, `label` and `verdict`, and an earlier fixture
 * carried none of them: the mock factory is untyped, so `tsc` said nothing,
 * and the screen is a recorder that renders nothing, so the mapping was
 * exercised against a shape no server produces.
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
    },
    {
      id: 'SEN-1001\u001Faccounts\u0000r.okonjo',
      incident: 'SEN-1001',
      collection: 'accounts',
      label: 'r.okonjo',
      verdict: 'existing' as const,
      fields: { username: 'r.okonjo' },
      existing: 'a-row-the-case-holds',
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
    },
  ],
}

const WORKSPACE = { key: 'ws-1', name: 'aurora-soc', group: 'aurora' }

const provider = {
  connect: () => Promise.resolve({ identity: 'analyst', token: 't' }),
  listSources: () => Promise.resolve({ sources: [WORKSPACE] }),
  listIncidents: () => Promise.resolve({ incidents: [{ key: 'SEN-1001', title: 'A phish' }] }),
  fetchDetail: () => Promise.resolve({ raw: { alerts: [], entities: [] } }),
}

/** Mutable, so a case changing under a mounted wizard can be driven. */
let openCase = 'case-1'
vi.mock('@/app/useCaseId', () => ({ useCaseId: () => openCase }))
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
  startCaseFromIncident: () => Promise.resolve({}),
}))

interface Writes {
  connect: (registration: unknown) => Promise<unknown>
  sources: () => Promise<unknown>
  incidents: (sourceId: string, dials: Record<string, unknown>) => Promise<unknown>
  preview: (sourceId: string, ids: readonly string[]) => Promise<unknown>
  commit: (sourceId: string, ids: readonly string[]) => Promise<unknown>
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
/** The mounted wizard, so a case change can be driven without a new tree. */
let view: ReturnType<typeof render> | null = null

async function ready(): Promise<Writes> {
  // Cleared per case: both are module-level, so a second render that never
  // reached the screen would otherwise be handed the first one's writes.
  writes = null
  commits.length = 0
  previews.length = 0
  view = render(<ImportSentinelContainer />)
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
    previews.length = 0
    writes = null
    openCase = 'case-1'
  })

  it('approves the candidate ids the preview named, not the incident keys', async () => {
    const held = await ready()
    await held.commit(WORKSPACE.key, ['SEN-1001'])

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
    await held.commit(WORKSPACE.key, ['SEN-1001'])

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
    const answered = await held.commit(WORKSPACE.key, ['SEN-1001'])

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

    // A re-render rather than a second render: the ref holding the reviewed
    // plan belongs to the mounted component, and a fresh tree would not have
    // it. Two elements, because React bails out given the identical one.
    openCase = 'case-2'
    view!.rerender(<ImportSentinelContainer />)
    await waitFor(() => {
      expect(writes, 'the re-render handed the screen no writes').not.toBeNull()
    })

    await expect(writes!.commit(WORKSPACE.key, ['SEN-1001'])).rejects.toThrow(/Review the rows/)
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

    await expect(held.commit(WORKSPACE.key, ['SEN-1001', 'SEN-2002'])).rejects.toThrow(
      /Review the rows/,
    )
    expect(commits, 'a selection nobody reviewed reached the server').toHaveLength(0)
  })
})
