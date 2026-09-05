import type { ActivityEntry } from '@/api/activity'
import { CaseKeyTimesSheet } from '@/components/blocks/case-key-times-sheet'
import type { Person } from '@/components/blocks/presence'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'
import { caseSwitcherRows, sessionRows } from '@/fixtures/railMenus'

/**
 * The three facts the case header carries, as a worked example.
 */

/** Who is in the campaign case. Yourself first, as the stack expects. */
export const caseRoster: readonly Person[] = [
  { name: 'Dev Analyst', you: true },
  { name: 'Joy Okonkwo' },
  { name: 'Sam Whitfield' },
]

/**
 * What has been written to the case, newest first.
 */
export function caseActivity(atSeconds: number): ActivityEntry[] {
  return [
    {
      seq: 9,
      entity: 'timeline',
      entityId: 'tl-31',
      op: 'insert',
      version: 1,
      by: 'Joy Okonkwo',
      at: atSeconds - 40,
      fields: ['summary'],
    },
    {
      seq: 8,
      entity: 'systems',
      entityId: 'sys-4',
      op: 'update',
      version: 3,
      by: 'Sam Whitfield',
      at: atSeconds - 900,
      fields: ['status', 'owner'],
    },
    {
      seq: 7,
      entity: 'evidence',
      entityId: 'ev-2',
      op: 'insert',
      version: 1,
      by: 'Dev Analyst',
      at: atSeconds - 7_200,
      fields: ['label'],
    },
  ]
}

/** The analyst every gallery page is signed in as. */
export const SIGNED_IN: Person = { name: 'analyst@example.test', you: true }

/**
 * Every prop `CaseFrame` needs to draw the chrome, in one place.
 */
export const caseChrome = {
  caseName: campaignCase.reference ?? campaignCase.id,
  caseCaption: campaignCase.customer ?? undefined,
  caseStatus: 'Open',
  switcher: caseSwitcherRows,
  // The five stamps are what an analyst reaches for from whichever section
  // they are standing on, so the trigger rides the case header.
  // Fed the case and the specs: without them the panel opens on an empty form,
  // and only a story finds that -- the unit test hands the pair in by name.
  headerEnd: <CaseKeyTimesSheet kase={campaignCase} specs={specsFixture} />,
  people: caseRoster,
  user: { person: SIGNED_IN, caption: 'Analyst', menu: sessionRows },
} as const
