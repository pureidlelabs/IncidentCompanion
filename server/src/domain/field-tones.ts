/**
 * How a classification value is painted: which hue, and whether it is filled.
 *
 * **Two axes.** `tone` names a colour role; `fill` says whether anything is
 * wrong here. Filled means adverse, hollow means nothing is or it is
 * explained. Both are served, because a new value must not need a client
 * change - the client owns what a role looks like and nothing else.
 *
 * A role the client does not paint falls through to grey there, so a hue this
 * server names before the tokens exist degrades rather than breaking.
 */

/** Filled: something is wrong here. Hollow: nothing is, or it is explained. */
export type ToneFill = 'solid' | 'hollow'

export interface FieldTone {
  /** A colour role the client paints. Unknown roles draw grey. */
  tone: ToneRole
  fill: ToneFill
}

/**
 * The colour roles the client has tokens for.
 *
 * **Adding a hue is one entry here plus one in
 * `ui/src/components/blocks/field-tones.ts`, and nothing else** - that is the
 * whole reason the tone is served as a role name rather than as a class.
 */
export const TONE_ROLES = [
  'critical',
  'high',
  'medium',
  'low',
  'contain',
  'investigate',
  'info',
  'none',
] as const

export type ToneRole = (typeof TONE_ROLES)[number]

/** Something is wrong here. */
const adverse = (tone: ToneRole): FieldTone => ({ tone, fill: 'solid' })

/** Nothing is wrong here, or it is explained. */
const clear = (tone: ToneRole): FieldTone => ({ tone, fill: 'hollow' })

/**
 * Values ruled to carry **no** tone, so they take the grey fall-through.
 *
 * Grey is the absence of a judgement, and that is exactly what `unknown` is.
 * `disposition` was split apart because `unknown` meant *we cannot tell* and
 * *nobody has checked* at once -- `triage` carries the second now -- so
 * painting it anything at all re-merges them.
 */
export const DELIBERATELY_GREY = ['unknown'] as const

/**
 * Values the maintainer has not ruled on, which take the same grey.
 *
 * **Empty, and the list stays.** Grey on screen cannot say whether it was
 * chosen or defaulted, so the difference lives here: a value named below is
 * awaiting a decision, and a value in `DELIBERATELY_GREY` has had one.
 * `field-tones.test.ts` refuses a vocabulary value that is in neither list and
 * has no tone, so the next value the server grows forces the choice rather
 * than quietly inheriting grey.
 */
export const UNRULED: readonly string[] = [
  /**
   * The three `TASK_STATUS` values `analysis_status` and `status` never
   * mapped. They draw grey today and nobody chose that -- found by looking at
   * the Assets table, where 27 of 30 rows carry a grey `open` chip.
   */
  'open',
  'blocked',
  'cancelled',
]

/**
 * Which fields read as a toned chip in a table, and against which values.
 *
 * **A client without this renders a judgement column as plain text**, which is
 * the one thing chips exist to prevent.
 *
 * Values absent from a field's map draw grey -- `DELIBERATELY_GREY` for the
 * one ruled to have none, `UNRULED` for one awaiting a ruling, and nothing at
 * all for a string no vocabulary holds. The three are one colour on screen,
 * which is why the first two are written down.
 */
export const FIELD_TONES: Record<string, Record<string, FieldTone>> = {
  /**
   * What we concluded about a host.
   *
   * `clean` is the one hollow value: assessed, and nothing is wrong here.
   */
  verdict: {
    compromised: adverse('critical'),
    accessed: adverse('medium'),
    suspected: adverse('low'),
    clean: clear('contain'),
    /**
     * **Adverse, and off the ramp.** Opportunistic malware really is on the
     * host, so it fills; but the point of the value is that it is *not* the
     * intrusion being hunted, and blue is the only family here meaning noted
     * rather than dangerous. On the ramp it would compete with the thing it
     * exists to be told apart from.
     */
    'commodity infection': adverse('info'),
  },
  /**
   * **A lifecycle is never adverse, so it never fills.**
   *
   * Fill answers *is anything wrong here*, and "in progress" makes no such
   * claim -- it says where the work got to. Filling it would put two chips on
   * every row of the Assets table and reproduce the count that decision was
   * made against: 60 filled chips and 69 uppercase strings on one screen,
   * measured, which is why `ui/src/components/blocks/entity-scope-table.tsx` says nothing here
   * shouts. A run of filled chips is meant to be the shape of the incident,
   * and it stops being that the moment a workflow state joins in.
   */
  analysis_status: { 'in progress': clear('info'), completed: clear('low') },
  status: { 'in progress': clear('info'), completed: clear('low') },
  /**
   * **Two fields are named `disposition` and this map is keyed by name**, so
   * this entry carries both vocabularies. They are disjoint, which is what
   * makes that safe - a value appearing in both is a reason to rename one of
   * the fields rather than to split this map.
   *
   * The indicator half is `malicious`/`suspicious`/`benign`; the rest is what
   * happened to a body of data, and it is the CIA triad -- `exfiltrated` and
   * `accessed` are confidentiality, `destroyed` is availability, and the
   * integrity leg is unruled.
   *
   * **`benign` is not the good end.** It means the indicator showed up and has
   * an explanation, so it keeps the yellow and goes hollow. Green would file
   * "somebody looked at this and it was fine" under the same word as "nothing
   * was ever here".
   */
  disposition: {
    malicious: adverse('critical'),
    suspicious: adverse('low'),
    benign: clear('low'),

    exfiltrated: adverse('investigate'),
    accessed: adverse('low'),
    destroyed: adverse('high'),
    /**
     * **The same hue as `destroyed`, deliberately.** Same leg, same weight,
     * and encryption is often the more recoverable of the two -- the word
     * carries that difference, and a hotter colour would claim ransomware
     * outranks destruction. Two chips of one hue in one column is the ruling,
     * not a collision to fix.
     */
    encrypted: adverse('high'),
    /**
     * The whole integrity leg, and a middling harm: worse than something being
     * read, less final than something being gone. `medium` is unused elsewhere
     * in this vocabulary, so it collides with nothing in its own column.
     */
    altered: adverse('medium'),
    untouched: clear('contain'),
  },
  /**
   * New here: Python had no triage field. Under investigation is not a verdict.
   *
   * Hollow throughout, for the reason `analysis_status` is: `untriaged` says
   * nobody has looked, which is not the same claim as something being wrong.
   */
  triage: { untriaged: clear('medium'), investigating: clear('info'), assessed: clear('low') },
  /**
   * **Not a classification, and drawn beside one.** A boolean with an
   * `isolatedAt` stamp, keyed by the string a cell renders, so a contained
   * host reads as contained next to whatever its verdict is.
   */
  isolated: { true: clear('contain') },
}
