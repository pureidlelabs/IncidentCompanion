/**
 * LAB - every keyboard shortcut the editor answers, in one table.
 *
 * **The table is the source for both the bindings and the cheat sheet**, the
 * same reason `SectionActionRow` draws itself from the command registry: a
 * shortcut that works and is listed nowhere is indistinguishable from one that
 * does not exist, which was the whole complaint - StarterKit already answered
 * bold, italic, both list kinds, three heading levels and undo, and the screen
 * said so nowhere.
 *
 * **`from` records who owns each binding**, because most of them are not ours.
 * `kit` is StarterKit's own keymap and is *documented* here rather than
 * re-registered - binding it a second time would shadow the library's with a
 * copy that drifts. `lab` is the handful this file adds. `rule` is not a
 * shortcut at all but an InputRule: typing the characters is the gesture.
 */

export type KeyOwner = 'kit' | 'lab' | 'rule'

export interface ProseKey {
  group: string
  /** Written with `Mod`; `keyLabel` swaps in the platform's glyph. */
  keys: string
  label: string
  from: KeyOwner
}

export const PROSE_KEYS: readonly ProseKey[] = [
  { group: 'Text', keys: 'Mod-B', label: 'Bold', from: 'kit' },
  { group: 'Text', keys: 'Mod-I', label: 'Italic', from: 'kit' },
  { group: 'Text', keys: 'Mod-E', label: 'Code', from: 'kit' },
  { group: 'Text', keys: 'Mod-Shift-X', label: 'Strikethrough', from: 'kit' },

  { group: 'Structure', keys: 'Mod-Alt-2', label: 'Subhead', from: 'kit' },
  { group: 'Structure', keys: 'Mod-Alt-3', label: 'Minor head', from: 'kit' },
  { group: 'Structure', keys: 'Mod-Alt-0', label: 'Back to body text', from: 'kit' },
  { group: 'Structure', keys: 'Mod-Shift-8', label: 'Bulleted list', from: 'kit' },
  { group: 'Structure', keys: 'Mod-Shift-7', label: 'Numbered list', from: 'kit' },
  { group: 'Structure', keys: 'Mod-Shift-B', label: 'Quote', from: 'kit' },
  { group: 'Structure', keys: 'Tab', label: 'Indent the list item', from: 'kit' },
  { group: 'Structure', keys: 'Shift-Tab', label: 'Outdent it again', from: 'kit' },

  { group: 'Insert', keys: '/', label: 'Everything you can insert', from: 'rule' },
  { group: 'Insert', keys: '## ', label: 'Subhead, as you type', from: 'rule' },
  { group: 'Insert', keys: '- ', label: 'Bulleted list, as you type', from: 'rule' },
  { group: 'Insert', keys: '1. ', label: 'Numbered list, as you type', from: 'rule' },
  { group: 'Insert', keys: '> ', label: 'Quote, as you type', from: 'rule' },
  { group: 'Insert', keys: '**bold**', label: 'Bold, as you type', from: 'rule' },

  { group: 'Moving', keys: 'Mod-Alt-\u2193', label: 'Next section', from: 'lab' },
  { group: 'Moving', keys: 'Mod-Alt-\u2191', label: 'Previous section', from: 'lab' },
  { group: 'Moving', keys: 'Mod-/', label: 'This list', from: 'lab' },

  { group: 'Undo', keys: 'Mod-Z', label: 'Undo', from: 'kit' },
  { group: 'Undo', keys: 'Mod-Shift-Z', label: 'Redo', from: 'kit' },
]

/**
 * `Mod` is Cmd on a Mac and Ctrl everywhere else, and this is display only -
 * ProseMirror's keymap resolves the real `Mod` itself, so nothing branches on
 * the platform outside this function.
 */
export function keyLabel(keys: string): string {
  // **`userAgent`, not `navigator.platform`**, which is deprecated and removed
  // from the modern surface. Nothing branches on the answer beyond which glyph
  // is drawn, so a wrong guess costs a `Ctrl+` on a Mac rather than a shortcut
  // that does not work - ProseMirror resolves the real `Mod` itself.
  const mac = typeof navigator !== 'undefined'
    && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
  return keys
    .replace('Mod-', mac ? '\u2318' : 'Ctrl+')
    .replace('Alt-', mac ? '\u2325' : 'Alt+')
    .replace('Shift-', mac ? '\u21e7' : 'Shift+')
}

export const KEY_GROUPS = [...new Set(PROSE_KEYS.map((key) => key.group))]
