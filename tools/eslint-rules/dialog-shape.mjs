/**
 * A dialog's size is the frame's decision, never the caller's.
 *
 * `dialog.tsx`'s own docstring has said so since the sizes were written --
 * *"the width is the spec's decision and not the caller's taste"* -- and
 * nothing enforced it. Measured 2026-08-19 over the fifteen `DialogContent`
 * call sites: three named a size, three wrote their own width, nine defaulted
 * because nobody chose, and the middle size had no caller at all. Prose lost.
 *
 * **What the escapes have in common is the tell.** All three hand-written
 * widths are on finders -- the command palette also writes `p-0` and
 * `top-[15%]` -- so they are not three mistakes but one archetype the frame
 * did not offer. A rule that only banned the escape would have hidden that;
 * the fix was to give the frame a fourth shape.
 *
 * **Height is the half that reads as a size and is not one.** `max-h-[70vh]`
 * renders 200px with two fields and 700px with twenty, so a body carrying its
 * own cap resizes on every state change -- which is the "the dialogs keep
 * changing size" complaint, spelled in CSS. The frame owns both axes; the body
 * fills what it is given.
 *
 * Not a formatter and not a test: it marks the line as it is typed, where a
 * suite says "something, somewhere" minutes later.
 */

/** Utilities that would take a size decision away from the frame. Width and
 *  height only -- where the popup sits is the next rule down, because the two
 *  have different answers: a size is the archetype's, a position is too, but
 *  only one of them is ever a legitimate thing to want. */
const SIZING = /^(max-w-|w-\[|min-w-|max-h-|h-\[|min-h-)/

/** Utilities that place the popup. `finder` is top-anchored by the frame, so a
 *  caller reaching for these is asking for an archetype. */
const PLACEMENT = /^(top-|bottom-|left-|right-|translate-|inset-)/

function classesOf(node) {
  if (!node) return []
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value.split(/\s+/).filter(Boolean)
  }
  if (node.type === 'JSXExpressionContainer') return classesOf(node.expression)
  if (node.type === 'TemplateLiteral') {
    return node.quasis.flatMap((q) => q.value.raw.split(/\s+/).filter(Boolean))
  }
  // `cn('a', cond && 'b')` and friends: read every string argument.
  if (node.type === 'CallExpression') return node.arguments.flatMap(classesOf)
  if (node.type === 'LogicalExpression') return [...classesOf(node.left), ...classesOf(node.right)]
  if (node.type === 'ConditionalExpression') {
    return [...classesOf(node.consequent), ...classesOf(node.alternate)]
  }
  return []
}

export default {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      sized:
        'A dialog may not size itself: `{{cls}}` on DialogContent. The frame owns ' +
        'both axes -- pass an archetype (compact / form / workbench / finder) and ' +
        'let the body fill it. A max-height is not a height: the same rule renders ' +
        'a short box with two fields and a tall one with twenty, which is the box ' +
        'resizing as you use it.',
      placed:
        'A dialog may not place itself: `{{cls}}` on DialogContent. Where a dialog ' +
        'sits belongs to the archetype -- a finder is top-anchored by the ' +
        'frame. If no archetype puts it where you need, that is a missing ' +
        'archetype rather than a missing class.',
    },
  },

  create(context) {
    return {
      JSXOpeningElement(node) {
        const name = node.name
        // **`AlertDialogContent` too.** The delete confirmation moved onto the
        // registry's `AlertDialog`, and a rule matching the literal
        // `DialogContent` stopped seeing the one dialog fifteen screens open.
        // Verified by putting `max-w-2xl top-[15%]` on it and getting exit 0.
        if (name.type !== 'JSXIdentifier' || !/^(?:Alert)?DialogContent$/.test(name.name)) return

        for (const attr of node.attributes) {
          if (attr.type !== 'JSXAttribute') continue
          if (attr.name.name !== 'className') continue

          for (const cls of classesOf(attr.value)) {
            // A responsive prefix hides the utility behind a colon, and a
            // negative utility behind a minus. Both are how a rule like this
            // gets bypassed once it exists rather than argued with.
            const withPrefix = cls.includes(':') ? cls.slice(cls.lastIndexOf(':') + 1) : cls
            const bare = withPrefix.startsWith('-') ? withPrefix.slice(1) : withPrefix
            if (SIZING.test(bare)) {
              context.report({ node: attr, messageId: 'sized', data: { cls } })
            } else if (PLACEMENT.test(bare)) {
              context.report({ node: attr, messageId: 'placed', data: { cls } })
            }
          }
        }
      },
    }
  },
}
