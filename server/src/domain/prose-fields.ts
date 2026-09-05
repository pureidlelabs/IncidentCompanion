/**
 * Where one block's prose lives inside its report's document.
 */
import * as Y from 'yjs'

export function fragmentFor(doc: Y.Doc, blockId: string): Y.XmlFragment {
  return doc.getXmlFragment(blockId)
}

/**
 * Whether a block's fragment holds anything a reader would call written.
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
