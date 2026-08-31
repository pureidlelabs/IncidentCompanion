/**
 * What every surface knows about a linked entity, and the words a dangling id
 * renders as.
 *
 * A leaf so `entity-link.tsx` and `entity-card.tsx` can both have it without
 * closing a cycle - the link mounts the card, and the card renders a link back
 * into the section.
 */

/** The words a resolved-to-nothing id renders as. Shared with the editable cells. */
export const MISSING_REFERENCE = '(missing reference)'

export interface LinkedEntity {
  id: string
  /** `FieldRef.target` - `system`, `account`, `network`, `malware`, ... */
  target: string
  /** The resolved display name, or `''` when nothing resolves it. */
  name: string
}
