/**
 * A method: how a finding was obtained.
 *
 * **A lab note about an act that happened elsewhere, never a script.** The app
 * runs nothing - investigations happen in the SIEM, the shell or the forensic
 * suite - so every field here is one a *reader* needs to believe the claim and
 * retype it in their own console. There are no credentials, no connection and
 * no test button, and `workspace` is a label naming which console to open
 * rather than anything this app resolves. -> `openspec/specs/collections/spec.md`,
 * *Investigation-first*
 *
 * **The window is stated, never derived.** `ago(7d)` re-run next month covers a
 * different week, and *Derivation never guesses* forbids the app rewriting the
 * analyst's text on a parse it cannot be sure of. So `query` is verbatim
 * forever and `windowFrom`/`windowTo` are the analyst's own absolute pair -
 * neither computed from the other, and both drawn.
 *
 * **`rowsReturned` is labelled *as recorded* wherever it is drawn.** The app
 * did not fetch it, so a label implying it did would let a regulator read a
 * typed number as a measured one. A dropped console export makes it stronger
 * and still not verified: the file could be from a different query.
 *
 * **Every recorded field is `recorded()`, not `pasted()`.** The latter strips
 * `U+0000-U+001F`, newline and tab included, which turns a five-line query
 * into one line while leaving a populated string behind. -> `domain/recorded.ts`
 */
import { z } from 'zod'

import { field } from '../field-spec.js'
import { recorded } from '../recorded.js'
import { optionalCount, unsettable } from '../vocabularies.js'
import { methodKindSchema, queryGrammarSchema } from '../vocabularies.js'

const text = (max: number) => z.string().trim().max(max).default('')

/**
 * The ceiling on a query and on a recorded result.
 *
 * A saved console export belongs in the evidence store, which holds bytes and
 * has the rules for hostile ones; this column holds what a person pasted to
 * make the row readable on its own. Generous enough for a real query and a
 * page of output, small enough that nobody mistakes it for the artefact.
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
   *
   * **The first thing the report prints**, because a reviewer scanning an
   * appendix is looking for the claim rather than the syntax.
   */
  established: field(text(1000), {
    label: 'What this established',
    kind: 'textarea',
    fullWidth: true,
  }),

  /**
   * Which console this was run in, and where inside it.
   *
   * **A label, not a target.** Nothing resolves `workspace`, so no control may
   * imply the app knows the workspace exists - an autocomplete over what this
   * case has already used is the honest offer.
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
   *
   * Free text for the same reason `evidence.collectedBy` is: the person who
   * ran the query is often not an analyst with an account here.
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
   *
   * Unset leaves it plain, which is the right answer for a terminal transcript:
   * that is output rather than source, and a source highlighter marks up
   * prompts and result rows as keywords.
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
   *
   * **Verbatim and kept forever.** Nothing normalises it, nothing pins a
   * relative window inside it, and nothing defangs it on the way to a
   * document - the one field in the app that reaches Word byte-exact.
   * -> `report/document/defang.ts`
   */
  query: field(recorded(z.string().max(RECORDED_MAX).default('')), {
    label: 'Query or command',
    kind: 'textarea',
    fullWidth: true,
  }),

  /**
   * The absolute window the act covered.
   *
   * **Its own pair, stated by the analyst**, because a relative window inside
   * the query text is not reproducible and the app may not rewrite it. Unset
   * is visible work rather than a validation error - *Capture is never
   * refused*.
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
   * **`null` is *not stated*; `0` is *nothing came back*.** Two different
   * facts, and a blank that stored `0` would record the second when the
   * analyst meant the first. -> `optionalCount`
   */
  rowsReturned: field(optionalCount(), {
    label: 'Rows returned (as recorded)',
    kind: 'number',
    hint: 'The app did not run the query, so this is what a person recorded.',
  }),

  /**
   * The header row of the export, when there was one.
   *
   * **A signal about what the query returned**, and never a schema: no column
   * name here becomes a field name anywhere. Stored as the `;`-joined text the
   * rest of the app uses for a list in one column.
   */
  resultColumns: field(recorded(z.string().max(2000).default('')), {
    label: 'Columns returned',
    kind: 'text',
    subordinate: true,
    fullWidth: true,
  }),

  /**
   * A pasted excerpt or terminal transcript - the same field for both.
   *
   * **One artefact whose form follows the kind**: a console query returns rows,
   * a shell session returns a transcript, and the storage, the *as recorded*
   * honesty and the untrusted-input handling are one problem in both cases.
   *
   * **Quoted telemetry, so it is defanged on export** - the exemption that
   * carries `query` out byte-exact stops at this field.
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
