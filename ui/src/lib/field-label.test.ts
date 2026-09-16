import { describe, expect, it } from 'vitest'

import type { FormSpec } from '@/api/specs'

import { labelled } from './field-label'

/** Two fields the server labels, one of which a screen also names. */
const FORM = {
  collection: null,
  columns: 1,
  fields: [
    { name: 'name', label: 'What the record is called (as filed)', kind: 'text' },
    { name: 'systemId', label: 'Which system holds it', kind: 'text' },
  ],
  blank: {},
} as unknown as FormSpec

describe('a field heading', () => {
  const label = labelled(FORM, { name: 'Name' })

  it('takes the override where the served label collides with one', () => {
    expect(label('name')).toBe('Name')
  })

  it('takes the served label, shortened, where no override names the field', () => {
    expect(label('systemId')).toBe('Which system holds it')
  })

  it('falls back to the field name where the form describes no such field', () => {
    expect(label('hash')).toBe('hash')
  })

  it('still answers with the override before the specs arrive', () => {
    const early = labelled(undefined, { name: 'Name' })
    expect(early('name')).toBe('Name')
    expect(early('systemId')).toBe('systemId')
  })
})
