/**
 * How a classification value is painted: which hue, and whether it is filled.
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
 */
export const DELIBERATELY_GREY = ['unknown'] as const

/**
 * Values the maintainer has not ruled on, which take the same grey.
 */
export const UNRULED: readonly string[] = [
  /**
   * The three `TASK_STATUS` values `analysis_status` and `status` never mapped.
   */
  'open',
  'blocked',
  'cancelled',
]

/**
 * Which fields read as a toned chip in a table, and against which values.
 */
export const FIELD_TONES: Record<string, Record<string, FieldTone>> = {
  /**
   * What we concluded about a host.
   */
  verdict: {
    compromised: adverse('critical'),
    accessed: adverse('medium'),
    suspected: adverse('low'),
    clean: clear('contain'),
    /**
     * **Adverse, and off the ramp.**
     */
    'commodity infection': adverse('info'),
  },
  /**
   * **A lifecycle is never adverse, so it never fills.**
   */
  analysis_status: { 'in progress': clear('info'), completed: clear('low') },
  status: { 'in progress': clear('info'), completed: clear('low') },
  /**
   * **Two fields are named `disposition` and this map is keyed by name**, so
   * this entry carries both vocabularies.
   */
  disposition: {
    malicious: adverse('critical'),
    suspicious: adverse('low'),
    benign: clear('low'),

    exfiltrated: adverse('investigate'),
    accessed: adverse('low'),
    destroyed: adverse('high'),
    /**
     * **The same hue as `destroyed`, deliberately.**
     */
    encrypted: adverse('high'),
    /**
     * The whole integrity leg, and a middling harm: worse than something being
     * read, less final than something being gone.
     */
    altered: adverse('medium'),
    untouched: clear('contain'),
  },
  /**
   * New here: Python had no triage field. Under investigation is not a verdict.
   */
  triage: { untriaged: clear('medium'), investigating: clear('info'), assessed: clear('low') },
  /**
   * **Not a classification, and drawn beside one.**
   */
  isolated: { true: clear('contain') },
}
