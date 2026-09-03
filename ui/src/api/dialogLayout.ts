import { fieldsOf, sectionsOf, type FieldSpec, type FormSpec } from './specs'

/**
 * Where a served form's fields go on screen.
 *
 * Two shapes, and they do not meet: `bodySections` stacks a form dialog into
 * the groups its schema declares, each folding its own optional run, and
 * `entityTiers` stacks an entity form into identity, assessment and a folded
 * detail band.
 *
 * **The rule lives here and nowhere else.** It is computed from what the wire
 * already carries - `section`, `subordinate`, `tier` and `footerRow` - rather
 * than served as a layout. Nothing here names a field, and nothing here reads
 * a control's kind: how a field is drawn was never a claim about what it
 * belongs with.
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
 *
 * **Empty below two columns.** A one-column form lays them out in its own
 * grid; no shipped spec has one, so the guard is unobservable through any
 * rendered form and the unit test drives a synthetic single-column shape
 * instead.
 */
export function footerFields<TData>(form: FormSpec<TData>): FieldSpec<TData>[] {
  if (form.columns < 2) return []
  return fieldsOf(form).filter((field) => field.footerRow === true)
}

/**
 * The stacked groups a form dialog draws, each split into what it shows and
 * what it folds.
 *
 * **Both halves are read off the wire; neither is inferred.** `section` marks
 * where a group starts and `subordinate` marks a field that opens below the
 * fold - `specs.ts` has said so about that flag since it was added.
 *
 * **The predecessor grouped by control kind, and that is what made the first
 * group a leftover.** `columnGroups` sent textareas to Notes and reference
 * selects to Linked, so Details was everything that was neither: the clock,
 * the telemetry source, three classification fields, an assessment pair, the
 * provenance and the tags. Ten fields whose only shared property was not being
 * one of the other two kinds. It read as a group while it was a narrow column
 * and as a grab-bag the moment the dialog stacked. `entityTiers` had already
 * rejected the same rule for the same reason.
 *
 * **And it threw both flags away on purpose**, because at three columns a
 * `subordinate` run could straddle a column boundary and a heading could
 * strand itself over whatever followed. Stacked, neither can happen: a group
 * is a band across the full width, and its fold is inside it.
 *
 * A form declaring no section is one group titled `''` - which is every form
 * that is not stacked, and is what keeps this total.
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
 *
 * **A group with nothing above its fold is a row, not a section.** It draws a
 * heading, a rule and a disclosure and nothing else, so three of them in a
 * row - which is what the event form has - read as a stack of dividers rather
 * than as structure. Measured on a new event: `Actors and location` and
 * `Provenance` came to 21px each, putting three hairlines inside 90px directly
 * under two sections that had real controls in them.
 *
 * Gathered, they draw as one bordered list of rows, which is also what they
 * are: the optional half of the form, one line each.
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
 *
 * **Because `fieldsOf` drops the markers and the entity dialogs need them.**
 * A `section` marker precedes the field that declared it and governs
 * everything until the next, which `sectionsOf` already knows - but an entity
 * form is grouped by `tier` first, so its titles have to be looked up per
 * field rather than read as a run.
 *
 * **Three of them were served and drawn nowhere.** `EVIDENCE_FIELDS` declares
 * "Chain of custody" and "What this is evidence of", `IMPACT_FIELDS` declares
 * "Scale" and "Where it was", `NETWORK_FIELDS` and `SYSTEM_FIELDS` declare
 * "Mitigation" - and every entity dialog drew three unnamed zones, with the
 * names living only in an `aria-label` no eye ever reaches.
 *
 * A field before the first marker maps to `''`, which is a group that draws no
 * heading rather than one headed with an empty string.
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
 *
 * Order is preserved and a title is only opened where the schema opens one, so
 * a tier declaring none comes back as a single untitled group - which is what
 * every entity form's identity tier is.
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
 *
 * **A gated field rides its gate's row rather than taking one.** Containment
 * is one fact - "Blocked, at 19:57 UTC" - and two rows asked it twice, the
 * second restating the first's absence as "Not recorded".
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
 *
 * **A group-by on what the schema declares, and nothing is inferred.** A field
 * carrying `tier` opens it and the fields after it belong to it, so the
 * declaration order is the reading order and only the boundaries are typed.
 *
 * **The predecessor guessed, and the guess was right by luck.** It read
 * `subordinate` as a positional boundary - against that flag's own documented
 * meaning - and keyed the band off the control kind. On `NETWORK_FIELDS`, the
 * one form that declared its groups, it reproduced the declaration exactly;
 * on `EVIDENCE_FIELDS` it put `collectedAt`, the *when* of a chain of custody,
 * in a band headed "Links and containment", away from the `collectedBy` its
 * own section groups it with. How a field is drawn is not a claim about how
 * often it is set.
 *
 * A form declaring no tier is not an entity form: everything lands in
 * `assessment`, which draws the plain grid such a form wants.
 * `specs.controller.test.ts` is what holds every entity form to declaring one.
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
   *
   * **Resolved to the *root*, not to the immediate gate.** A chain two deep -
   * C gated by B, B gated by A - left C belonging to a field that was itself
   * not a row, so C was drawn nowhere at all: dropped by the filter and
   * collected by no row's `gated`. No schema declares one today; a field
   * silently missing from a dialog is not a failure mode worth leaving reachable.
   *
   * The walk is bounded by the number of fields, so a schema that somehow
   * declares a cycle stops rather than hanging.
   */
  const byName = new Map<string, FieldSpec<TData>>(banded.map((one) => [one.name, one]))
  const rootOf = (field: FieldSpec<TData>): FieldSpec<TData> => {
    let at = field
    // Bounded by the field count, so a schema that somehow declares a cycle
    // stops rather than hanging. `for...of` over the fields reads as a walk
    // over them, which this is not - it is a hop count.
    for (const _hop of banded) {
      void _hop
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
