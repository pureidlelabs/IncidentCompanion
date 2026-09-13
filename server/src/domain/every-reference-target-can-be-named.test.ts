/**
 * That every collection a reference points at can be written in a file.
 *
 * **The set is read off the schemas, never listed here.** A `refTarget` added
 * tomorrow is in this test the moment it exists; a hand-kept copy is the thing
 * that stops covering the new one silently -- and silently is exactly how a
 * reference gets dropped on import, which is the defect this whole mechanism
 * is against. -> #51
 */
import { describe, expect, it } from 'vitest'

import { REFERENCING_SCHEMAS } from './collections.js'
import { referenceFieldsOf } from './references.js'
import { REFERENCE_KEY_FIELDS, answersTo, canBeNamed, nameOf } from './reference-key.js'

/**
 * Every collection anything in the tree points at.
 *
 * **`REFERENCING_SCHEMAS`, not `COLLECTION_SCHEMAS`.** The timeline publishes
 * no single schema and the narrower set omits it, which hides the two targets
 * only the timeline points at.
 */
const TARGETS = [
  ...new Set(
    REFERENCING_SCHEMAS.flatMap((schema) => referenceFieldsOf(schema).map((one) => one.target)),
  ),
].sort()

describe('every collection a reference points at', () => {
  it('is a set this test found rather than one it was given', () => {
    // Without this the case below passes over an empty set, which is the shape
    // that reads as coverage.
    expect(TARGETS.length).toBeGreaterThan(4)
    expect(TARGETS).toContain('methods')
  })

  it.each(TARGETS)('can be named in a file: %s', (target) => {
    expect(
      canBeNamed(target),
      `a reference points at ${target} and no file can say which row it meant, ` +
        'so every such reference is lost on import',
    ).toBe(true)
  })

  it('names nothing it was not asked about', () => {
    const unreachable = Object.keys(REFERENCE_KEY_FIELDS).filter((one) => !TARGETS.includes(one))
    expect(unreachable, 'a key is declared for a collection nothing points at').toEqual([])
  })
})

describe('a name', () => {
  it('is the row own value, trimmed', () => {
    expect(nameOf('systems', { hostname: '  WKS-001 ' })).toBe('WKS-001')
  })

  it('falls to the next field where the strongest is absent', () => {
    expect(nameOf('malware', { hash: '', filename: 'svchost.exe' })).toBe('svchost.exe')
    expect(nameOf('malware', { hash: 'abc123', filename: 'svchost.exe' })).toBe('abc123')
  })

  it('is null where the row answers to none of them', () => {
    expect(nameOf('malware', { hash: '', filename: '   ' })).toBeNull()
    expect(nameOf('impact', { label: 'Mailbox down' })).toBeNull()
  })

  /**
   * **Case-folded, because the ordinary use is export and re-import.** A file
   * carrying `WKS-001` against a stored `wks-001` is the same host, and
   * refusing it loses the link the file was written to keep.
   */
  it('answers across case', () => {
    expect(answersTo('systems', { hostname: 'wks-001' }, 'WKS-001')).toBe(true)
    expect(answersTo('systems', { hostname: 'wks-001' }, 'wks-002')).toBe(false)
  })

  it('answers on any of the fields a row can be named by', () => {
    const binary = { hash: 'abc123', filename: 'svchost.exe' }
    expect(answersTo('malware', binary, 'svchost.exe')).toBe(true)
    expect(answersTo('malware', binary, 'ABC123')).toBe(true)
  })

  /**
   * **An empty name is not a name.** Most reference cells are blank, and a
   * blank matching every row with a blank hostname would attach them to each
   * other.
   */
  it('is never answered by an empty value', () => {
    expect(answersTo('systems', { hostname: '' }, '')).toBe(false)
    expect(answersTo('systems', { hostname: '' }, '   ')).toBe(false)
  })
})
