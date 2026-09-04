/** Types for `probe.js`, which is plain JavaScript on purpose - see its docstring. */
export type FindingKind =
  | 'h-scroll'
  | 'clipped-text'
  | 'overlap'
  | 'offscreen'
  | 'low-contrast'
  | 'small-target'
  | 'hidden-control'
  | 'off-centre'
  | 'size-overridden'
  | 'paints-past-the-corner'

export interface Finding {
  kind: FindingKind
  what: string
  detail: string
}

export function probe(args: [string | null, string]): Finding[]
