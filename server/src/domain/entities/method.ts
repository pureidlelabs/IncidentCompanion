/**
 * A method: how a finding was obtained.
 */
import { z } from 'zod'

import { field } from '../field-spec.js'
import { recorded } from '../recorded.js'
import { optionalCount, unsettable } from '../vocabularies.js'
import { methodKindSchema, queryGrammarSchema } from '../vocabularies.js'

const text = (max: number) => z.string().trim().max(max).default('')

/**
 * The ceiling on a query and on a recorded result.
 */
const RECORDED_MAX = 20_000

export const methodSchema = z.object({
  name: field(z.string().trim().min(1).max(255), {
    tier: 'identity',
    label: 'Name',
    kind: 'text',
    hint: 'What a reader will see cited beside a claim.',
  }),

  kind: field(unsettable(methodKindSchema), {
    label: 'Kind',
    kind: 'select',
    vocabulary: 'methodKind',
  }),

  /**
   * What the act established, in the analyst's words.
   */
  established: field(text(1000), {
    label: 'What this established',
    kind: 'textarea',
    fullWidth: true,
  }),

  /**
   * Which console this was run in, and where inside it.
   */
  console: field(text(200), {
    tier: 'assessment',
    label: 'Console',
    kind: 'autocomplete',
    section: {
      title: 'Where it ran',
      copy: 'Named so a reader knows which console to open. Nothing here is resolved.',
    },
  }),

  workspace: field(text(200), {
    label: 'Workspace or scope',
    kind: 'autocomplete',
    subordinate: true,
  }),

  /**
   * Who ran it and when, which is not who typed this row.
   */
  runBy: field(text(200), {
    label: 'Run by',
    kind: 'autocomplete',
    subordinate: true,
  }),

  runAt: field(z.iso.datetime().nullable().default(null), {
    label: 'Run at',
    kind: 'event_datetime',
    subordinate: true,
  }),

  /**
   * What the recorded text is written in, so the screen can highlight it.
   */
  grammar: field(unsettable(queryGrammarSchema), {
    label: 'Grammar',
    kind: 'select',
    vocabulary: 'queryGrammar',
    section: {
      title: 'What was run',
      copy: 'Kept exactly as it was run. Nothing here is rewritten or normalised.',
    },
  }),

  /**
   * The query, command or acquisition step, exactly as it was run.
   */
  query: field(recorded(z.string().max(RECORDED_MAX).default('')), {
    label: 'Query or command',
    kind: 'textarea',
    fullWidth: true,
  }),

  /**
   * The absolute window the act covered.
   */
  windowFrom: field(z.iso.datetime().nullable().default(null), {
    label: 'Window searched from',
    kind: 'event_datetime',
    section: {
      title: 'What it covered, and what came back',
      copy: 'Stated, never read out of the query: a relative window moves.',
    },
  }),

  windowTo: field(z.iso.datetime().nullable().default(null), {
    label: 'Window searched to',
    kind: 'event_datetime',
  }),

  /**
   * **`null` is *not stated*; `0` is *nothing came back*.**
   */
  rowsReturned: field(optionalCount(), {
    label: 'Rows returned (as recorded)',
    kind: 'number',
    hint: 'The app did not run the query, so this is what a person recorded.',
  }),

  /**
   * The header row of the export, when there was one.
   */
  resultColumns: field(recorded(z.string().max(2000).default('')), {
    label: 'Columns returned',
    kind: 'text',
    subordinate: true,
    fullWidth: true,
  }),

  /**
   * A pasted excerpt or terminal transcript - the same field for both.
   */
  resultExcerpt: field(recorded(z.string().max(RECORDED_MAX).default('')), {
    label: 'Result or transcript',
    kind: 'textarea',
    subordinate: true,
    fullWidth: true,
    hint: 'Optional. Most acts have no transcript, and the row is complete without one.',
  }),

  tags: field(text(500), {
    label: 'Tags',
    kind: 'tag_select',
    subordinate: true,
    fullWidth: true,
  }),
})

export type MethodEntry = z.infer<typeof methodSchema>
