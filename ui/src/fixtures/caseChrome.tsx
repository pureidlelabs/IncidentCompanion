import type { ActivityEntry } from '@/api/activity'
import { CaseKeyTimesSheet } from '@/components/blocks/case-key-times-sheet'
import type { Person } from '@/components/blocks/presence'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'
import { caseSwitcherRows, sessionRows } from '@/fixtures/railMenus'

/**
 * The three facts the case header carries, as a worked example.
 *
 * Here rather than in one story file because three surfaces draw them - the
 * frame, the activity door and the gallery's in-a-case decorator - and written
 * three times they drift into three different cases.
 */

/** Who is in the campaign case. Yourself first, as the stack expects. */
export const caseRoster: readonly Person[] = [
  { name: 'Dev Analyst', you: true },
  { name: 'Joy Okonkwo' },
  { name: 'Sam Whitfield' },
]

/**
 * What has been written to the case, newest first.
 *
 * Stamped relative to `atSeconds` rather than at a fixed epoch, so the feed's
 * relative times read as an afternoon's work wherever it is drawn. A test
 * passes its own `atSeconds` and gets the same spread.
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
 *
 * **One copy, because two drift without either being wrong.** A decorator
 * building its own and a story building another differ in what the head shows
 * and which triggers it carries, and each is right on its own terms, so
 * nothing catches the gap. `only-one-case-chrome.rule.test.ts` is what stops a
 * second appearing.
 *
 * The shell's story is deliberately not a caller: it draws slots rather than a
 * case, which is the whole distinction between it and the frame.
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
