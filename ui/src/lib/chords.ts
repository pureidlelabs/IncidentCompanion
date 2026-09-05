/** One key on a shortcut, with its modifiers. */
export interface Chord {
  /** The printing key, as it reads on a cap. */
  key: string
  /** Command on a Mac, Control everywhere else. */
  mod?: boolean
  shift?: boolean
}

/** A keypress reduced to the four things a chord is matched on. */
export interface ChordEvent {
  key: string
  /** Ctrl or Cmd; a chord never tells the two apart. */
  mod: boolean
  shift: boolean
  alt: boolean
}

export function chordEventOf(event: KeyboardEvent): ChordEvent {
  return {
    key: event.key,
    mod: event.ctrlKey || event.metaKey,
    shift: event.shiftKey,
    alt: event.altKey,
  }
}

/**
 * Whether a keypress fires a chord. Alt held fires nothing.
 */
export function chordFires(chord: Chord, event: ChordEvent): boolean {
  if (event.alt) return false
  if (event.key.toLowerCase() !== chord.key.toLowerCase()) return false
  if (event.mod !== (chord.mod ?? false)) return false
  if (!/^[a-z]$/i.test(chord.key)) return true
  return event.shift === (chord.shift ?? false)
}

/** Tags whose own keyboard beats a document chord. */
const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'])

function typesInto(node: EventTarget | null): boolean {
  if (!(node instanceof HTMLElement)) return false
  if (TYPING_TAGS.has(node.tagName)) return true
  // The attribute, not `isContentEditable`: jsdom leaves that undefined, so
  // the guard would read false in the only tier that tests it.
  const editable = node.getAttribute('contenteditable')
  return editable !== null && editable !== 'false'
}

/**
 * Whether the keyboard belongs to a control rather than to the document.
 */
export function isTypingTarget(target: EventTarget | null, within: Document = document): boolean {
  return typesInto(target) || typesInto(within.activeElement)
}

/**
 * Whether a modal is open, and so owns the keyboard outright.
 */
export function aDialogIsOpen(doc: Document): boolean {
  return doc.querySelector('[role="dialog"], [role="alertdialog"]') !== null
}
