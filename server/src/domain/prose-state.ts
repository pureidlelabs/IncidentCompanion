/**
 * What the install tells a connection about the words it holds for a document
 * that connection has open: `unsaved` once a save of them fails, `saved` once
 * one stores them, and `lost` once they can no longer be stored.
 */
export const PROSE_STATES = ['unsaved', 'saved', 'lost'] as const
export type ProseState = (typeof PROSE_STATES)[number]

/** The frame that carries it, addressed by the field the connection opened. */
export interface ProseStateFrame {
  type: 'prose.state'
  field: string
  state: ProseState
}
