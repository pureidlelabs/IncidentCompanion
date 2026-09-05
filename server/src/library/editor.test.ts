/**
 * The library editor, which is derived from a payload schema rather than
 * described a second time.
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  editorDocument,
  messagesFrom,
  payloadFrom,
  valuesOf,
  withRow,
  withoutRow,
} from './editor.js'
import { SNIPPET_SLOTS, caseTemplateSchema, reportSnippetSchema } from './kinds.js'

const BASE = {
  schema: caseTemplateSchema,
  kind: 'templates',
  name: 'phishing',
  title: 'Phishing campaign',
  subtitle: 'Built-in',
  blurb: '',
  canEdit: true,
}

function documentFor(values: Record<string, unknown>, canEdit = true) {
  return editorDocument({ ...BASE, values, canEdit })
}

describe('what the schema says the form is', () => {
  it('makes a section of every array of objects, and a field of the rest', () => {
    const document_ = documentFor({})
    expect(document_.sections.map((one) => one.key)).toEqual(['actions', 'evidence', 'notes'])
    expect(document_.fields.map((one) => one.key)).toEqual([
      'initialAccessVector',
      'reportTemplate',
    ])
  })

  it('carries a section\u2019s columns even when it has no rows', () => {
    // A section with nothing in it still has to draw an Add and a header, so
    // the columns are the section's rather than the first row's.
    const document_ = documentFor({})
    const actions = document_.sections.find((one) => one.key === 'actions')
    expect(actions?.rows).toEqual([])
    expect(actions?.specs.map((one) => one.key)).toEqual(['task', 'taskType'])
  })

  it('prefers the declared label and control to a derived one', () => {
    const document_ = documentFor({})
    const notes = document_.sections.find((one) => one.key === 'notes')
    expect(notes?.heading).toBe('Notes')
    expect(notes?.specs[0]?.kind, 'a note is prose, not a one-line input').toBe('textarea')
  })

  it('derives a readable label for a key nothing declared one for', () => {
    const loose = z.object({ someUnlabelledThing: z.string().optional() })
    const document_ = editorDocument({ ...BASE, schema: loose, values: {} })
    expect(document_.fields[0]?.label).toBe('Some unlabelled thing')
  })

  it('sees through the wrappers a schema is built out of', () => {
    // `z.array(...).default([])` is two deep. Stopping at the first unwrap
    // leaves an array looking like a scalar, and the section renders as a text
    // box holding `[object Object]`.
    const wrapped = z.object({
      rows: z.array(z.object({ a: z.string() })).default([]).optional(),
    })
    const document_ = editorDocument({ ...BASE, schema: wrapped, values: {} })
    expect(document_.sections.map((one) => one.key)).toEqual(['rows'])
    expect(document_.fields).toEqual([])
  })

  it('names one row singularly, for Add and the empty state', () => {
    // **From the key, not the heading.** `actions` is headed *Checklist*, and
    // "Add checklist" names the section rather than the thing being added.
    const document_ = documentFor({})
    expect(document_.sections.map((one) => one.noun)).toEqual(['action', 'evidence', 'note'])
  })

  it('binds stored values onto the rows, keyed by position', () => {
    const document_ = documentFor({ actions: [{ task: 'Pull the headers', taskType: 'ir' }] })
    const row = document_.sections[0]?.rows[0]
    expect(row?.fields.map((one) => [one.key, one.value])).toEqual([
      ['actions.0.task', 'Pull the headers'],
      ['actions.0.taskType', 'ir'],
    ])
  })

  it('says a built-in may be read and not written', () => {
    // The maintainer asked to preview a shipped template. Refusing the document to
    // anything unwritable means duplicating it first just to look.
    expect(documentFor({}, false).canEdit).toBe(false)
  })
})

describe('turning a form back into a payload', () => {
  it('reads a dotted key as a row of a section', () => {
    expect(
      payloadFrom([
        { key: 'initialAccessVector', value: 'phishing' },
        { key: 'actions.0.task', value: 'One' },
        { key: 'actions.1.task', value: 'Two' },
      ]),
    ).toEqual({
      initialAccessVector: 'phishing',
      actions: [{ task: 'One' }, { task: 'Two' }],
    })
  })

  it('closes the gap a removed row leaves', () => {
    // Removing row 1 of three leaves keys 0 and 2. An array with a hole in it
    // is not what `z.array` expects, and not what the next render numbers from.
    expect(
      payloadFrom([
        { key: 'actions.0.task', value: 'One' },
        { key: 'actions.2.task', value: 'Three' },
      ]),
    ).toEqual({ actions: [{ task: 'One' }, { task: 'Three' }] })
  })

  it('ignores a key that is neither a field nor a row', () => {
    // The form posts what it holds; a key shape nobody serves is not a reason
    // to refuse the whole save.
    expect(payloadFrom([{ key: 'a.b.c.d', value: 'x' }])).toEqual({})
  })

  it('round-trips a document through its own values', () => {
    const document_ = documentFor({
      actions: [{ task: 'One', taskType: '' }],
      initialAccessVector: 'phishing',
    })
    expect(payloadFrom(valuesOf(document_))).toEqual({
      actions: [{ task: 'One', taskType: '' }],
      initialAccessVector: 'phishing',
      reportTemplate: '',
    })
  })
})

describe('adding and removing a row', () => {
  const starting = valuesOf(documentFor({ actions: [{ task: 'One', taskType: 'a' }] }))

  it('adds one blank row carrying every column', () => {
    const next = payloadFrom(withRow(starting, 'actions', [
      { key: 'task', label: 'Task', kind: 'text', options: [] },
      { key: 'taskType', label: 'Task type', kind: 'text', options: [] },
    ]))
    expect(next['actions']).toEqual([
      { task: 'One', taskType: 'a' },
      { task: '', taskType: '' },
    ])
  })

  it('removes the row asked for and renumbers the rest', () => {
    const three = valuesOf(
      documentFor({ actions: [{ task: 'A' }, { task: 'B' }, { task: 'C' }] }),
    )
    const left = payloadFrom(withoutRow(three, 'actions', 1)) as { actions: { task: string }[] }
    expect(left.actions.map((one) => one.task)).toEqual(['A', 'C'])
  })

  it('leaves the other sections alone', () => {
    const both = valuesOf(documentFor({ actions: [{ task: 'A' }], notes: [{ note: 'keep' }] }))
    const after = payloadFrom(withoutRow(both, 'actions', 0)) as { notes: { note: string }[] }
    expect(after.notes).toEqual([{ note: 'keep' }])
  })
})

describe('what a refusal tells the analyst', () => {
  it('names the control that broke the rule, and puts the tone second', () => {
    // **The tone is the second element**, which is the wrong way round to
    // guess: the client filters with `([, tone]) => tone === 'negative'`, so a
    // message written the other way renders as a success with the word
    // "negative" in it.
    const failed = caseTemplateSchema.safeParse({ actions: [{ task: '' }] })
    expect(failed.success).toBe(false)
    const [message] = messagesFrom(failed.error!)
    expect(message?.[0]).toMatch(/^actions\.0\.task: /)
    expect(message?.[1]).toBe('negative')
  })
})

/**
 * **The form is the whole of GUI authoring, so a field it cannot draw is a
 * field nobody can fill.**
 */
describe('the form a report snippet gets', () => {
  const document_ = editorDocument({
    ...BASE,
    schema: reportSnippetSchema,
    kind: 'report-snippets',
    values: {},
  })

  it('offers the slots rather than asking the analyst to spell one', () => {
    const slot = document_.fields.find((one) => one.key === 'slot')
    expect(slot?.options.map((one) => one.value)).toEqual(['', ...SNIPPET_SLOTS])
  })

  it('draws translations as rows that can be added to', () => {
    const section = document_.sections.find((one) => one.key === 'translations')
    expect(section?.specs.map((one) => one.key)).toEqual(['language', 'label', 'hint', 'body'])
  })
})
