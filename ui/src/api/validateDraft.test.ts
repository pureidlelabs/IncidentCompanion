import { describe, expect, it } from 'vitest'

import { joinIso } from '@/components/ui/datetime-input'
import { problemsIn } from './validateDraft'

/**
 * The client-side refusal, attacked at the three shapes that separate it from
 * a second copy of the rules.
 */

describe('a create', () => {
  it('accepts a draft carrying only what was filled in', () => {
    // The schema's own defaults supply `type`, `disposition` and `triage`.
    expect(problemsIn('network_indicators', { value: '198.51.100.7' }, false)).toEqual({})
  })

  /**
   * **The blanks are dropped before parsing, and this is why.**
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
   * **Parsed whole, because the draft already is the row.**
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
   * **Empty rather than thrown.**
   */
  it.each([[null], [undefined], ['case_facts' as never]])('answers empty for %j', (collection) => {
    expect(problemsIn(collection, { anything: 'at all' }, false)).toEqual({})
  })
})

describe('the wording a refusal reaches the screen as', () => {
  /**
   * **Zod's own messages are developer strings and none of these is one.**
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
   * **A `custom` message passes through**, because it is the one somebody wrote
   * at the field, for a person.
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
   * **What the control emits has to be what the column accepts**, and for
   * five collections it was not.
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
