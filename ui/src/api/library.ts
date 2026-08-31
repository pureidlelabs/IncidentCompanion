/**
 * `/api/library` -- the drop-in-file libraries (case templates, report
 * layouts, report styles; plugins carries no `new_label` and this tier does
 * not render it). These calls ride the same session cookie as everything else
 * in `src/api/`, which is the only credential this server takes.
 *
 * Driven off `GET /api/library`'s own slug list rather than a name typed in
 * this file, same reason `useCaseTemplates` names no template: a library the
 * server adds reaches this tier with no client change.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'

import { request, type ApiError } from './client'
import { keys } from './queryKeys'

export interface LibrarySummary {
  slug: string
  noun: string
  newLabel: string | null
  allowBlank: boolean
}

export interface LibraryEntry {
  name: string
  label: string
  /** Shown under the template picker on the new-case form. */
  description: string
  /** "yours" / "built-in" -- the chip's text, mirroring `LibraryRow.origin`. */
  origin: 'yours' | 'built-in'
  canEdit: boolean
  canDelete: boolean
  canDuplicate: boolean
}

export interface StartOption {
  value: string
  label: string
}

export interface LibraryListing extends LibrarySummary {
  entries: readonly LibraryEntry[]
  startOptions: readonly StartOption[]
}

/** `(message, level)` -- `picker_writes.Written`'s own shape, unpacked
 *  rather than renamed so a level ("positive" / "negative" / "warning")
 *  reads the same here as it does in every refusal. */
export type WrittenMessage = readonly [string, string]

export interface Written {
  ok: boolean
  messages: readonly WrittenMessage[]
}

export function useLibrary(slug: string): UseQueryResult<LibraryListing> {
  return useQuery({
    queryKey: keys.library(slug),
    queryFn: () => request<LibraryListing>(`/library/${encodeURIComponent(slug)}`),
  })
}

/**
 * The structured editor, served by `server/src/library/editor.ts`.
 *
 * **Every control here is the server's decision** - which fields exist, what a
 * row is, which values a column offers, which of them are colours. This tier
 * renders the document and invents nothing: a vocabulary typed into a file
 * here would be a second copy of the payload schema, and a library an analyst
 * dropped in would need a client change to be editable.
 *
 * **On Node the document is derived from that schema rather than written
 * out.** Python described each library's editor by hand across three modules,
 * so a new library needed its editor written again; here an array of objects
 * is a section and everything else is a field, and a template that gains a
 * column gains a control with no change on either side.
 *
 * A built-in answers with `canEdit: false` rather than a 404 - reading what a
 * shipped template contains should not require duplicating it first.
 *
 * A field key (`actions.0.task`, `sev.high.fill`) is a *value* in this
 * document and never an object key, because `fromWire` rewrites keys at every
 * depth - a map keyed by them would arrive with its field names rewritten and
 * post back keys the server has never heard of.
 */
export interface EditorOption {
  value: string
  label: string
}

/** `text` / `textarea` / `select` / `colour` - which control to draw. */
export interface EditorField {
  key: string
  label: string
  value: string
  kind: string
  options: readonly EditorOption[]
}

/** One column of a row section, before it is bound to a row's values. Carried
 *  separately because a section with no rows still has columns. */
export interface EditorSpec {
  key: string
  label: string
  kind: string
  options: readonly EditorOption[]
}

export interface EditorSection {
  key: string
  heading: string
  /** What one row is called, for Add and the empty state. */
  noun: string
  specs: readonly EditorSpec[]
  rows: readonly { fields: readonly EditorField[] }[]
}

export interface EditorDocument {
  kind: string
  name: string
  title: string
  subtitle: string
  blurb: string
  /** A flat editor (report styles). Empty for the row-based libraries. */
  fields: readonly EditorField[]
  sections: readonly EditorSection[]
  messages: readonly WrittenMessage[]
  /** The library's property, not this render's - a preview that vanished
   *  because a colour was mid-edit reads as the preview being broken. */
  hasPreview: boolean
}

/** `[{key, value}]`, the shape the editor routes take. A list because the keys
 *  are data and `toWire` would rewrite them. */
export interface EditorValue {
  key: string
  value: string
}

export function valuesOf(document: EditorDocument): EditorValue[] {
  const out = document.fields.map((f) => ({ key: f.key, value: f.value }))
  for (const section of document.sections) {
    for (const row of section.rows) {
      out.push(...row.fields.map((f) => ({ key: f.key, value: f.value })))
    }
  }
  return out
}

export function useLibraryEditor(
  slug: string,
  name: string | null,
): UseQueryResult<EditorDocument> {
  return useQuery({
    queryKey: keys.libraryEditor(slug, name ?? ''),
    queryFn: () =>
      request<EditorDocument>(
        `/library/${encodeURIComponent(slug)}/${encodeURIComponent(name ?? '')}/editor`,
      ),
    enabled: name !== null,
    // Refetching under an open editor would replace what is being typed with
    // what is on disk.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
}

export interface PreviewChip {
  key: string
  /** Bare hex, as a report style stores it - the client adds the `#`. */
  fill: string
  ink: string
}

export interface PreviewDocument {
  /** `--rp-*` custom properties, bound to the specimen's own style. */
  vars: Record<string, string>
  /** App-owned markup with nothing interpolated into it. */
  specimen: string
  chips: readonly PreviewChip[]
  floor: number
  contrast: readonly (readonly [string, number])[]
}

/**
 * The live specimen for the values currently in the form.
 *
 * The values ride in the query string because the route is a GET with no
 * effect, the shape the form submits. A 404 is the
 * ordinary answer while a colour is half-typed; `placeholderData` is what
 * keeps the last good specimen on screen instead of blanking the pane.
 */
export function useLibraryPreview(
  slug: string,
  name: string | null,
  values: readonly EditorValue[],
  enabled: boolean,
): UseQueryResult<PreviewDocument> {
  const query = new URLSearchParams(values.map((v) => [v.key, v.value])).toString()
  return useQuery({
    queryKey: keys.libraryPreview(slug, name ?? '', query),
    queryFn: () =>
      request<PreviewDocument>(
        `/library/${encodeURIComponent(slug)}/${encodeURIComponent(name ?? '')}/preview?${query}`,
      ),
    enabled: enabled && name !== null,
    retry: false,
    placeholderData: (previous) => previous,
  })
}

/** Every mutation below invalidates the same key: one library's rows, its
 *  problems and its start options all come off one GET, so a write that
 *  changed any of them refetches all three together rather than guessing
 *  which changed. */
function useLibraryInvalidate(slug: string) {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: keys.library(slug) })
}

/**
 * **One field goes over the wire: what the analyst called it.** The key a route
 * addresses the entry by is derived server-side, so the form does not ask for a
 * slug whose only correct answer is a function of the name.
 *
 * `startFrom` is another entry's key, or `''` for an empty one.
 */
export function useLibraryCreate(
  slug: string,
): UseMutationResult<Written, ApiError, { label: string; startFrom: string }> {
  const invalidate = useLibraryInvalidate(slug)
  return useMutation({
    mutationFn: ({ label, startFrom }) =>
      request<Written>(`/library/${encodeURIComponent(slug)}`, {
        method: 'POST',
        body: startFrom ? { label, startFrom } : { label },
      }),
    onSuccess: (written) => {
      if (written.ok) void invalidate()
    },
  })
}

/**
 * **Duplicating is creating with a `startFrom`**, not its own route. Two
 * spellings of one operation is how a fix lands on the half nobody calls -
 * which is what had happened: both posted a body no schema accepted, so
 * neither New nor Duplicate could write a row.
 */
export function useLibraryDuplicate(
  slug: string,
): UseMutationResult<Written, ApiError, { name: string; label: string }> {
  const invalidate = useLibraryInvalidate(slug)
  return useMutation({
    mutationFn: ({ name, label }) =>
      request<Written>(`/library/${encodeURIComponent(slug)}`, {
        method: 'POST',
        body: { label: `${label} copy`, startFrom: name },
      }),
    onSuccess: (written) => {
      if (written.ok) void invalidate()
    },
  })
}

export interface EditorAction {
  name: string
  action: 'save' | 'add_row' | 'remove_row'
  /** Which run of rows, for the two row verbs. */
  section?: string
  index?: number
  values: readonly EditorValue[]
}

export interface EditorResult extends Written {
  editor: EditorDocument
}

/**
 * Save, add a row, or remove one - one mutation, because the server tells them
 * apart by `action` and answers all three with the same re-rendered document.
 *
 * **A refusal is a 422 carrying that document**, so `throwOnError` is not what
 * a caller wants here: `ApiError.body` is where the refused editor lives, and
 * the dialog re-seeds from it rather than from disk. A refetch would show the
 * analyst their edit vanishing instead of what was wrong with it.
 *
 * Only a successful save invalidates the row list: `add_row` and `remove_row`
 * write nothing.
 */
export function useLibraryEditorAction(
  slug: string,
): UseMutationResult<EditorResult, ApiError, EditorAction> {
  const client = useQueryClient()
  const invalidate = useLibraryInvalidate(slug)
  return useMutation({
    mutationFn: ({ name, action, section, index, values }) =>
      request<EditorResult>(
        `/library/${encodeURIComponent(slug)}/${encodeURIComponent(name)}/editor`,
        { method: 'POST', body: { action, section, index, values } },
      ),
    onSuccess: (result, { name, action }) => {
      if (action !== 'save' || !result.ok) return
      void invalidate()
      void client.invalidateQueries({ queryKey: keys.libraryEditor(slug, name) })
    },
  })
}

export function useLibraryDelete(
  slug: string,
): UseMutationResult<Written, ApiError, string> {
  const invalidate = useLibraryInvalidate(slug)
  return useMutation({
    mutationFn: (name) =>
      request<Written>(`/library/${encodeURIComponent(slug)}/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      }),
    onSuccess: (written) => {
      if (written.ok) void invalidate()
    },
  })
}

