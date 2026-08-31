/**
 * `data-slot` written after a spread is silently overwritten.
 *
 * **JSX attributes are applied in source order, so the last one wins.** A kit
 * component that writes `{...props}` and then its own `data-slot` throws away
 * whatever the call site named its surface -- with no error, no warning and no
 * difference in the rendered tree except the one attribute every test, probe
 * and stylesheet in this repository selects on.
 *
 * `button.tsx` carried it, and the cost was the shape this rule exists to
 * stop: an agent's story assertions went red twice, the attribute read
 * correctly at the call site, and the workaround they reached for was
 * `data-testid` -- a second handle for the same element, which is how a
 * codebase grows two selectors for one thing.
 *
 * **Before every spread, not merely before `{...props}`.** A component
 * routinely spreads a conditional object of its own beside the caller's, and a
 * rule that had to decide which spread carried caller props would be guessing
 * at a name. First attribute, always: the position is checkable, and a
 * component that genuinely has to force the slot has no business doing it
 * silently.
 */

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'A component writes its own `data-slot` before every spread, or the call site loses the one it set.',
    },
    fixable: 'code',
    schema: [],
    messages: {
      after:
        'This `data-slot` is written after a spread, so it overwrites whatever the call site set. Move it above the spread.',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        let spread = false
        for (const attr of node.attributes) {
          if (attr.type === 'JSXSpreadAttribute') {
            spread = true
            continue
          }
          if (!spread) continue
          if (attr.type !== 'JSXAttribute') continue
          const name = attr.name
          if (name.type !== 'JSXIdentifier' && name.type !== 'JSXNamespacedName') continue
          const spelled =
            name.type === 'JSXIdentifier' ? name.name : `${name.namespace.name}:${name.name.name}`
          if (spelled !== 'data-slot') continue
          context.report({
            node: attr,
            messageId: 'after',
            /**
             * Moves the attribute, and any comment written above it, to the
             * front of the element.
             *
             * The comment travels because it is the one thing a caller reading
             * the fix would look for: `popover.tsx` explains its position in a
             * comment, and a fixer that stranded that comment on the spread
             * below would leave the file saying the opposite of what it does.
             */
            fix(fixer) {
              const source = context.sourceCode
              const first = node.attributes[0]
              if (first === attr) return null
              const comments = source.getCommentsBefore(attr)
              const start = comments.length > 0 ? comments[0].range[0] : attr.range[0]
              // Skipping comments on purpose: the range removed has to start
              // before them, or the comment is left behind *and* copied.
              const previous = source.getTokenBefore(attr)
              const text = source.getText().slice(start, attr.range[1])
              // Re-indent to the attribute list rather than leaving prettier to
              // do it: this repository is not prettier-clean, so a formatting
              // pass over a fixed file rewrites the rest of it as well.
              const whole = source.getText()
              const lineStart = whole.lastIndexOf('\n', first.range[0]) + 1
              const indent = /^[ \t]*/.exec(whole.slice(lineStart, first.range[0]))[0]
              const oneLine = whole.slice(first.range[0], attr.range[0]).indexOf('\n') === -1
              return [
                fixer.removeRange([previous.range[1], attr.range[1]]),
                fixer.insertTextBefore(first, oneLine ? `${text} ` : `${text}\n${indent}`),
              ]
            },
          })
        }
      },
    }
  },
}
