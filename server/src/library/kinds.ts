/**
 * The libraries, and what each one holds.
 *
 * One surface, one payload shape per kind: the routes, the table and the
 * picker's panes are shared, and only the shape under `payload` differs, which
 * is why that column is `jsonb` and why the shape is validated here rather
 * than by the table.
 */
import { z } from 'zod'

import { field } from '../domain/field-spec.js'
import { languageTag } from '../domain/language-tag.js'

/**
 * An entry in the case-template checklist.
 *
 * **Labelled through the same registry the entity forms use.** The editor is
 * derived from this schema rather than described again - `library/editor.ts` -
 * so what a column is called and which control it draws is declared here, once,
 * beside the rule that validates it.
 */
const action = z.object({
  task: field(z.string().trim().min(1).max(500), { label: 'Task', kind: 'text' }),
  taskType: field(z.string().trim().max(64).optional(), {
    label: 'Task type',
    kind: 'text',
  }),
})

/**
 * What a new case is seeded with.
 *
 * **Every field optional but the checklist's own rows.** A template that seeds
 * only actions is the common one, and one that presets an access vector is a
 * convenience - neither is more valid, so a required field here would refuse a
 * template somebody reasonably wrote.
 */
export const caseTemplateSchema = z.object({
  actions: field(z.array(action).default([]), { label: 'Checklist', kind: 'text' }),
  evidence: field(
    z.array(z.object({
      name: field(z.string().trim().min(1).max(255), { label: 'Name', kind: 'text' }),
      type: field(z.string().trim().max(64).optional(), { label: 'Type', kind: 'text' }),
    })).default([]),
    { label: 'Evidence to collect', kind: 'text' },
  ),
  notes: field(
    z.array(z.object({
      note: field(z.string().trim().min(1).max(8000), { label: 'Note', kind: 'textarea' }),
    })).default([]),
    { label: 'Notes', kind: 'text' },
  ),
  /** Preset on the case when it is seeded, where the template is sure of it. */
  initialAccessVector: field(z.string().trim().max(200).optional(), {
    label: 'Initial access vector',
    kind: 'text',
  }),
  /** Which report layout a case from this template starts with. */
  reportTemplate: field(z.string().trim().max(120).optional(), {
    label: 'Report layout',
    kind: 'text',
  }),
})

export type CaseTemplate = z.infer<typeof caseTemplateSchema>

/**
 * The parts of a report a snippet can be filed under. A closed vocabulary,
 * because the picker groups on it; adding a slot is a line here and a
 * regenerated builtins file.
 */
export const SNIPPET_SLOTS = [
  'exec_summary',
  'detection',
  'identity',
  'hardening',
  'recovery',
  'governance',
  'caveats',
  'email',
] as const

/** The prose of one entry in one language. */
const snippetText = z.object({
  /** Overrides the entry's name in this language. Absent keeps the English one. */
  label: field(z.string().trim().max(200).optional(), { label: 'Label', kind: 'text' }),
  hint: field(z.string().trim().max(500).optional(), { label: 'When to use it', kind: 'text' }),
  body: field(z.string().trim().min(1, 'A translation with no prose inserts nothing.').max(8000), {
    label: 'Text',
    kind: 'textarea',
  }),
})

/**
 * A reusable paragraph, in every language it has been written in.
 *
 * English is the entry and the translations hang off it, so one entry carries
 * all its languages. `{{.field}}` in a body stays unresolved here - variables
 * expand when the document is built.
 */
export const reportSnippetSchema = z.object({
  /**
   * Which part of a report this is for -- an exec opener, a root cause, a
   * recommendation. The picker filters on it, because an analyst writing the
   * summary should not be offered thirty containment paragraphs.
   */
  slot: field(z.enum(['', ...SNIPPET_SLOTS]).default(''), { label: 'Section', kind: 'text' }),
  hint: field(z.string().trim().max(500).default(''), {
    label: 'When to use it',
    kind: 'text',
  }),
  /** Empty at rest is allowed; the picker refuses to offer a blank body. */
  body: field(z.string().trim().max(8000).default(''), {
    label: 'Text',
    kind: 'textarea',
  }),
  /**
   * Rows, not a map, because the editor is derived from this schema and has no
   * control for a map. The `superRefine` below is what refuses one language
   * twice.
   */
  translations: field(
    // Language leads the row: the form draws the columns in declaration order,
    // and which language this is is what the analyst picks the row out by.
    z.array(z.object({
      language: field(languageTag, { label: 'Language', kind: 'text' }),
      ...snippetText.shape,
    })).default([]),
    { label: 'Translations', kind: 'text' },
  ),
}).superRefine((entry, ctx) => {
  const seen = new Set<string>()
  for (const [index, one] of entry.translations.entries()) {
    if (seen.has(one.language)) {
      ctx.addIssue({
        code: 'custom',
        path: ['translations', index, 'language'],
        message: `This entry already has a ${one.language} translation.`,
      })
    }
    seen.add(one.language)
  }
})

export type ReportSnippet = z.infer<typeof reportSnippetSchema>

/**
 * The layout library's slug, exported so nothing spells it twice: `entry()`
 * matches the `kind` column exactly and answers `undefined` for a near miss,
 * which reads downstream as "this install ships no such layout".
 */
export const REPORT_LAYOUTS = 'report-layouts'

export interface LibraryKind {
  /** The URL segment, and the `kind` column's value. */
  slug: string
  /** What one row is called, for Add and the empty state. */
  noun: string
  /**
   * The New button's label, or `null` for a library that cannot be authored
   * here yet. The picker draws no New button when it is null.
   */
  newLabel: string | null
  /** Whether New offers an empty entry as well as a duplicate. */
  allowBlank: boolean
  /** Validates `payload`. Absent where nothing may be authored. */
  payload: z.ZodType | null
}

export const LIBRARY_KINDS: readonly LibraryKind[] = [
  {
    slug: 'templates',
    noun: 'template',
    newLabel: 'New template',
    allowBlank: true,
    payload: caseTemplateSchema,
  },
  // Served, and not authorable here: its pane renders so an analyst can see
  // what ships, and `newLabel` is null because editing one is not built.
  { slug: REPORT_LAYOUTS, noun: 'layout', newLabel: null, allowBlank: false, payload: null },
  {
    slug: 'report-snippets',
    noun: 'snippet',
    newLabel: 'New snippet',
    allowBlank: true,
    payload: reportSnippetSchema,
  },
]

export function kindOf(slug: string): LibraryKind | undefined {
  return LIBRARY_KINDS.find((kind) => kind.slug === slug)
}
