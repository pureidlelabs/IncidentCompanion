/**
 * A backslash escape in JSX renders as its own characters.
 *
 * **JSX attribute values and JSX text are raw text, not string literals.**
 * `label="Creating\u2026"` puts a backslash, a `u` and four digits in front of
 * the analyst; `label={'Creating\u2026'}` puts an ellipsis there. The two
 * differ by a pair of braces, they read identically in review, and every
 * instrument this repository has stays green on the wrong one -- TypeScript
 * accepts it, `local/ascii-only` is satisfied by it (the source *is* ASCII),
 * the unit tiers assert against the same broken string the component renders,
 * and Vale reads no `.tsx` attribute.
 *
 * Found on screen by the maintainer rather than by any check, on `StartCasePane`'s
 * `pendingLabel` -- a label that only appears during the round trip that
 * creates a case, so it had shipped unread.
 *
 * **This is the other half of `local/ascii-only`**, which already says that in
 * JSX *text* a backslash escape "would render as its own characters" and
 * prescribes a numeric entity there. It had no opinion about attributes, which
 * is the position that actually bit. The two rules meet: `ascii-only` decides
 * how a non-ASCII character is spelled, and this one decides where that
 * spelling is legal.
 *
 * **An AST rule rather than a regex**, for the same reason `ascii-only` is one:
 * the defect is entirely about *position*. `attr="\u2026"` is broken and
 * `attr={'\u2026'}` is the fix, and the two are one character apart in a
 * grep.
 */

/** Every escape a string literal honours and JSX does not. */
const ESCAPE = /\\(?:u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[nrtbfv0\\'"`])/

/**
 * The same value as a braced string literal.
 *
 * Single-quoted, matching the repo, so an apostrophe in the text has to be
 * escaped -- a value already carrying `\'` is left to the author, since
 * rewriting one is how a fixer produces a syntax error.
 */
function braced(raw) {
  const inner = raw.slice(1, -1)
  if (inner.includes("'")) return null
  return `{'${inner}'}`
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'A backslash escape in JSX renders literally; put it in a braced string.',
    },
    fixable: 'code',
    schema: [],
    messages: {
      attribute:
        'This escape renders as its own characters: JSX attribute values are raw text. Write {\'...\'} instead of "...".',
      text: 'This escape renders as its own characters: JSX text is raw. Use a braced string or a numeric entity.',
    },
  },
  create(context) {
    const source = context.sourceCode ?? context.getSourceCode()
    return {
      JSXAttribute(node) {
        const value = node.value
        if (!value || value.type !== 'Literal' || typeof value.value !== 'string') return
        const raw = source.getText(value)
        if (!ESCAPE.test(raw)) return
        const fixed = braced(raw)
        context.report({
          node: value,
          messageId: 'attribute',
          ...(fixed === null ? {} : { fix: (fixer) => fixer.replaceText(value, fixed) }),
        })
      },
      /**
       * No fixer here on purpose. `ascii-only` wants a numeric entity in JSX
       * text and a braced string is equally correct; which one reads better
       * depends on the character, and a fixer would decide that silently.
       */
      JSXText(node) {
        if (ESCAPE.test(source.getText(node))) {
          context.report({ node, messageId: 'text' })
        }
      },
    }
  },
}
