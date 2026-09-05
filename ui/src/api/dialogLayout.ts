import { fieldsOf, sectionsOf, type FieldSpec, type FormSpec } from './specs'

/**
 * Where a served form's fields go on screen.
 */

export interface BodySection<TData> {
  title: string
  /** One line saying what the group is, where the name cannot say it. */
  copy?: string
  /** Shown from the moment the dialog opens. */
  fields: FieldSpec<TData>[]
  /** Behind the section's own disclosure: the run the wire marks `subordinate`. */
  folded: FieldSpec<TData>[]
}

/**
 * The per-entry settings that ride the footer band rather than the body.
 */
export function footerFields<TData>(form: FormSpec<TData>): FieldSpec<TData>[] {
  if (form.columns < 2) return []
  return fieldsOf(form).filter((field) => field.footerRow === true)
}

/**
 * The stacked groups a form dialog draws, each split into what it shows and
 * what it folds.
 */
export function bodySections<TData>(form: FormSpec<TData>): BodySection<TData>[] {
  const footer = new Set(footerFields(form))
  return sectionsOf(form)
    .map((section) => {
      const fields = section.fields.filter((field) => !footer.has(field))
      const out: BodySection<TData> = {
        title: section.title,
        fields: fields.filter((field) => field.subordinate !== true),
        folded: fields.filter((field) => field.subordinate === true),
      }
      if (section.copy !== undefined) out.copy = section.copy
      return out
    })
    .filter((section) => section.fields.length + section.folded.length > 0)
}

/**
 * The groups, with adjacent all-optional ones gathered into one run.
 */
export function sectionRuns<TData>(
  sections: BodySection<TData>[],
): { folded: boolean; sections: BodySection<TData>[] }[] {
  const runs: { folded: boolean; sections: BodySection<TData>[] }[] = []
  for (const section of sections) {
    const folded = section.fields.length === 0
    const open = runs.at(-1)
    // A section with controls always starts its own run: two of them share no
    // container, and only the all-optional rows gather.
    if (open !== undefined && open.folded && folded) open.sections.push(section)
    else runs.push({ folded, sections: [section] })
  }
  return runs
}

/**
 * The section title governing each field, by field name.
 */
export function sectionTitles<TData>(form: FormSpec<TData>): ReadonlyMap<string, string> {
  const titles = new Map<string, string>()
  let open = ''
  for (const entry of form.fields) {
    if (isSectionEntry(entry)) open = entry.section.title
    else titles.set(entry.name, open)
  }
  return titles
}

/** A `{ section }` marker rather than a field. `sectionsOf` narrows the same way. */
function isSectionEntry<TData>(
  entry: FormSpec<TData>['fields'][number],
): entry is { section: { title: string; copy?: string } } {
  return 'section' in entry
}

/**
 * Split a run of fields into the groups their section markers declare.
 */
export function byTitle<TData>(
  fields: readonly FieldSpec<TData>[],
  titles: ReadonlyMap<string, string>,
): { title: string; fields: FieldSpec<TData>[] }[] {
  const out: { title: string; fields: FieldSpec<TData>[] }[] = []
  for (const field of fields) {
    const title = titles.get(field.name) ?? ''
    const open = out.at(-1)
    if (open?.title === title) open.fields.push(field)
    else out.push({ title, fields: [field] })
  }
  return out
}

/**
 * One line of the detail band: a field, and whatever it gates.
 */
export interface DetailRow<TData> {
  field: FieldSpec<TData>
  /** Fields naming `field.name` in their `enabledBy`. Usually none or one. */
  gated: FieldSpec<TData>[]
}

/** The three surfaces an entity dialog stacks, top to bottom. */
export interface EntityTiers<TData> {
  /** What the row *is*, on its own ground: the fields it is keyed on. */
  identity: FieldSpec<TData>[]
  /** What the case makes of it: the fields a triage pass changes. */
  assessment: FieldSpec<TData>[]
  /** Linkage, containment and tags, one folded line each. */
  detail: DetailRow<TData>[]
}

/**
 * Split a served form into its three surfaces.
 */
export function entityTiers<TData>(form: FormSpec<TData>): EntityTiers<TData> {
  // **A `footerRow` field belongs to the footer band and to no tier**, which
  // is how the event path reads it too. Without this they fall into whichever
  // tier is open when the declaration reaches them, and the dialog draws
  // `Colour` and its two checkboxes in the middle of the form.
  const fields = fieldsOf(form).filter((field) => field.footerRow !== true)
  const gates = new Set(fields.map((one) => one.enabledBy).filter(Boolean))

  const identity: FieldSpec<TData>[] = []
  const assessment: FieldSpec<TData>[] = []
  const banded: FieldSpec<TData>[] = []
  const into = { identity, assessment, detail: banded }

  let open: keyof typeof into = 'assessment'
  for (const field of fields) {
    if (field.tier) open = field.tier
    // A gate's own timestamp follows it into the band wherever it was
    // declared, since it is drawn on that row rather than on one of its own.
    into[gates.has(field.name) ? 'detail' : open].push(field)
  }

  /**
   * The field whose row this one is drawn on: itself, or the gate at the top
   * of its `enabledBy` chain.
   */
  const byName = new Map<string, FieldSpec<TData>>(banded.map((one) => [one.name, one]))
  const rootOf = (field: FieldSpec<TData>): FieldSpec<TData> => {
    let at = field
    // Bounded by the field count, so a schema that somehow declares a cycle
    // stops rather than hanging. `for...of` over the fields reads as a walk
    // over them, which this is not - it is a hop count.
    for (const _hop of banded) {
      const gate = at.enabledBy === undefined ? undefined : byName.get(at.enabledBy)
      if (!gate || gate === at) break
      at = gate
    }
    return at
  }

  // Paired here rather than in the render, so the quadratic runs once per form
  // rather than once per keystroke, and a row keeps one identity across edits.
  const detail = banded
    .filter((field) => rootOf(field) === field)
    .map((field) => ({
      field,
      gated: banded.filter((one) => one !== field && rootOf(one) === field),
    }))

  return { identity, assessment, detail }
}
