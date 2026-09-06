import { describe, expect, it } from 'vitest'

import { joinIso } from '@/components/ui/datetime-input'
import { problemsIn } from './validateDraft'

/**
 * The client-side refusal, attacked at the three shapes that separate it from
 * a second copy of the rules.
 *
 * **Every case here is one the server already refuses.** That is the property:
 * a draft this accepts and the route rejects is the failure mode the whole
 * thing exists to remove, and it is invisible until somebody presses Save on a
 * full screen.
 */

describe('a create', () => {
  it('accepts a draft carrying only what was filled in', () => {
    // The schema's own defaults supply `type`, `disposition` and `triage`.
    expect(problemsIn('network_indicators', { value: '198.51.100.7' }, false)).toEqual({})
  })

  /**
   * **The blanks are dropped before parsing, and this is why.** A create posts
   * only filled fields; leaving `''` in would refuse every optional field the
   * analyst never reached, on a form where that is most of them.
   */
  it('does not refuse an optional field left empty', () => {
    const draft = { value: 'evil.example', context: '', scope: '', port: '', tags: '' }
    expect(problemsIn('network_indicators', draft, false)).toEqual({})
  })

  it('names the required field a draft is missing', () => {
    const problems = problemsIn('network_indicators', { context: 'seen in EDR' }, false)
    expect(Object.keys(problems)).toEqual(['value'])
  })
})

describe('an edit', () => {
  /**
   * **Parsed whole, because the draft already is the row.** Dropping blanks
   * here would hide a required field the analyst had just emptied - the one
   * edit that most needs refusing.
   */
  it('refuses a required field cleared on an existing row', () => {
    const row = { value: '198.51.100.7', type: 'ipv4', disposition: 'malicious', triage: 'assessed' }
    expect(problemsIn('network_indicators', { ...row, value: '' }, true)).toHaveProperty('value')
  })

  it('accepts the row it was opened holding', () => {
    const row = { value: '198.51.100.7', type: 'ipv4', disposition: 'malicious', triage: 'assessed' }
    expect(problemsIn('network_indicators', row, true)).toEqual({})
  })
})

describe('the rules a required check cannot see', () => {
  /**
   * **The cross-field rule, which is the case that decided this.**
   * `networkIndicatorSchema` refines `scope` against `type`: only an address
   * has a scope, because a domain resolves the same from every network. No
   * per-field check can express it and nothing is served that describes it, so
   * without parsing against the schema the analyst learns about it from a save
   * that fails.
   */
  it('refuses a scope on a kind that cannot have one, against the field that is wrong', () => {
    const problems = problemsIn(
      'network_indicators',
      { value: 'evil.example', type: 'domain', scope: 'Branch-Amsterdam' },
      false,
    )
    expect(problems.scope).toMatch(/only an address/i)
  })

  it('allows the same scope on an address', () => {
    const problems = problemsIn(
      'network_indicators',
      { value: '10.0.0.5', type: 'ipv4', scope: 'Branch-Amsterdam' },
      false,
    )
    expect(problems).toEqual({})
  })

  it('refuses a value past the length the column holds', () => {
    const problems = problemsIn(
      'network_indicators',
      { value: 'a'.repeat(2049), type: 'domain' },
      false,
    )
    expect(problems).toHaveProperty('value')
  })

  it('refuses a reference that is not an id', () => {
    const problems = problemsIn(
      'network_indicators',
      { value: 'evil.example', systemId: 'WKS-FINANCE01' },
      false,
    )
    expect(problems).toHaveProperty('systemId')
  })
})

describe('a form this cannot speak for', () => {
  /**
   * **Empty rather than thrown.** `EntityDialog` draws forms that own no
   * collection, and a validator that threw on one would take the dialog to the
   * error boundary rather than let the server answer.
   */
  it.each([[null], [undefined], ['case_facts' as never]])('answers empty for %j', (collection) => {
    expect(problemsIn(collection, { anything: 'at all' }, false)).toEqual({})
  })
})

describe('the wording a refusal reaches the screen as', () => {
  /**
   * **Zod's own messages are developer strings and none of these is one.**
   * Unmapped, `networkIndicatorSchema` answers an absent required field with
   * "Invalid input: expected string, received undefined", a long one with
   * "Too small: expected string to have >=1 characters" and a bad reference
   * with "Invalid UUID". This is the assertion that stops one of those
   * reaching a control.
   */
  it.each([
    [{}, 'value', 'Required.'],
    [{ value: '' }, 'value', 'Required.'],
    [{ value: 'a'.repeat(2049) }, 'value', 'At most 2048 characters.'],
    [{ value: 'x', systemId: 'not-a-uuid' }, 'systemId', 'Choose one from the list.'],
    [{ value: 'x', type: 'carrier-pigeon' }, 'type', 'Select one of the options.'],
  ])('reads %j as %s: %s', (draft, field, expected) => {
    expect(problemsIn('network_indicators', draft, false)[field]).toBe(expected)
  })

  /**
   * **A `custom` message passes through**, because it is the one somebody
   * wrote at the field, for a person. Rewording it would throw away the only
   * message in the set that knows what the rule is about.
   */
  it('keeps the sentence the schema author wrote', () => {
    const problems = problemsIn(
      'network_indicators',
      { value: 'evil.example', type: 'domain', scope: 'Branch-Amsterdam' },
      false,
    )
    expect(problems.scope).toBe('Only an address has a scope.')
  })

  /** Nothing zod says reaches a control verbatim except a `custom` message. */
  it('lets no zod phrasing through', () => {
    const drafts: Record<string, unknown>[] = [
      {},
      { value: '' },
      { value: 'a'.repeat(2049) },
      { value: 'x', systemId: 'nope' },
      { value: 'x', type: 'carrier-pigeon' },
      { value: 'x', blocked: 'yes' },
    ]
    for (const draft of drafts) {
      for (const message of Object.values(problemsIn('network_indicators', draft, false))) {
        expect(message, JSON.stringify(draft)).not.toMatch(/invalid input|expected|received|too (small|big)|UUID/i)
      }
    }
  })
})

describe('the timestamp the date field writes', () => {
  /**
   * **What the control emits has to be what the column accepts.**
   *
   * An assembled ``...T10:30:00+00:00`` is refused: Zod 4's `z.iso.datetime()`
   * accepts `Z` and refuses an offset, and every `event_datetime` column is
   * declared with the bare form - so ticking Isolated, typing a date and a
   * time and pressing Save writes nothing, as a server 400 the screen cannot
   * explain.
   *
   * **`Z`, not a widened schema**, because `readStamp` publishes
   * `Date.toISOString()` on the way back, so the offset spelling is one the
   * server never produces and its own schema refuses.
   */
  it.each([
    ['systems', 'isolatedAt', 'hostname'],
    ['accounts', 'disabledAt', 'accountName'],
    ['malware', 'firstSeen', 'filename'],
    ['network_indicators', 'blockedAt', 'value'],
    ['evidence', 'collectedAt', 'name'],
  ])('%s accepts the stamp its own date field builds', (collection, field, required) => {
    const draft = { [required]: 'x', [field]: joinIso('2026-08-20', '10:30') }
    expect(problemsIn(collection as never, draft, false)).toEqual({})
  })

  /** And the round trip closes: what the server publishes parses again. */
  it('re-accepts a stamp that has been through the control', () => {
    const published = new Date('2026-08-20T10:30:00Z').toISOString()
    const { date, time } = { date: published.slice(0, 10), time: published.slice(11, 16) }
    expect(problemsIn('systems', { hostname: 'x', isolatedAt: joinIso(date, time) }, false)).toEqual(
      {},
    )
  })
})
