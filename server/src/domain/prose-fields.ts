/**
 * Where one block's prose lives inside its report's document.
 *
 * **One line, and it is here so there is one of it.** The walk that reads a
 * fragment back and the seeder that writes one both have to name the field the
 * same way, and they sit in different layers - `demos` may reach `domain` and
 * not `report`, so a copy in each is how the two quietly stop agreeing.
 *
 * Named by the block's id, which is what `Collaboration.configure({ field })`
 * on the client writes into.
 */
import * as Y from 'yjs'

export function fragmentFor(doc: Y.Doc, blockId: string): Y.XmlFragment {
  return doc.getXmlFragment(blockId)
}

/**
 * Whether a block's fragment holds anything a reader would call written.
 *
 * **Asked here because the client cannot ask it.** Python kept a written
 * block's text in a `body` column, so "is this section empty" was a string
 * check on the row. On this server the text is a CRDT, and the block row
 * carries no copy of it -- so a client reading `body` finds `undefined` and
 * marks every draft's sections empty however much is in them.
 *
 * **Whitespace is empty.** A fragment holding a single empty paragraph is what
 * an editor leaves behind when somebody opens a section and types nothing.
 */
export function hasProse(doc: Y.Doc, blockId: string): boolean {
  const fragment = fragmentFor(doc, blockId)
  return textIn(fragment).trim() !== ''
}

/** Every character under a node, ignoring what element it sits in. */
function textIn(node: Y.XmlFragment | Y.XmlElement | Y.XmlText | Y.XmlHook): string {
  // `YXmlText.toString()` is declared `any` by Yjs though it returns the
  // node's XML. Narrowed here rather than left to spread through the
  // recursion as an untyped value.
  if (node instanceof Y.XmlText) return node.toString() as string
  if (node instanceof Y.XmlFragment || node instanceof Y.XmlElement) {
    return node
      .toArray()
      .map((child) => textIn(child as Y.XmlElement | Y.XmlText))
      .join('')
  }
  return ''
}
