import type { Appearances } from '@/api/appearance'
import type { Participant } from '@/api/presence'
import type { Person } from '@/components/blocks/presence'

/**
 * The case's roster as discs, with each analyst's own choices folded in.
 *
 * **A named function because the decision is which key identifies somebody**,
 * and jsdom cannot see the answer: a wrong lookup renders a disc of the right
 * size in the right place, holding the wrong person's colour. Every assertion
 * a component test could make here passes against both spellings.
 */
export function peopleFrom(
  roster: Participant[],
  meUserId: string | undefined,
  chosen: Appearances | undefined,
): Person[] {
  const people = roster.map((participant) => ({
    name: participant.username,
    userId: participant.user_id,
    // Never `!== undefined` on both sides: with no session yet, a roster of
    // people whose ids are also undefined would all be me.
    you: meUserId !== undefined && participant.user_id === meUserId,
    ...(chosen?.get(participant.user_id) ?? {}),
  }))
  // Yourself first, then everyone else in arrival order - the server already
  // sorts by when they joined, and `sort` is stable.
  people.sort((a, b) => Number(b.you) - Number(a.you))
  return people
}
