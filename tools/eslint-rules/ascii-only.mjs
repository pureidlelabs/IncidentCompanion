/**
 * Source is ASCII, so a character that is not is a signal rather than a style.
 *
 * **The point is detection, not typography.** Text written by a model arrives
 * corrupted often enough to have cost this repository three sessions: a space
 * inside backticks became a NUL, a space in a CSS comment became U+6A19, and a
 * space in a docstring became U+9009 -- named here rather than shown, since
 * this file has to pass its own rule. The NUL is the dangerous one -- `ugrep`
 * treats the whole file as binary and answers "no match" for *every* pattern in
 * it, so a search reads as a confirmed negative and a scripted edit silently
 * does nothing.
 *
 * A range check for CJK catches two of those three and would sail past a
 * corrupted `e` or `u`, which matters now that Dutch and German strings are in
 * the tree. Restricting the alphabet to ASCII makes any byte over 0x7F suspect,
 * which turns a heuristic into a decision.
 *
 * **Where the character sits decides the treatment, and nothing else can.**
 *
 * - **In a comment, prose punctuation is respelled.** A comment renders
 *   nothing, so `-` says what an em dash says and reads better than an escape.
 * - **In a string, every character is escaped rather than respelled.** A string
 *   may be read by somebody: a select's empty option was an em dash and
 *   respelling it changed what an analyst sees. No rule can tell that from an
 *   em dash in an API description, so the sweep changes no rendered text at all
 *   -- `\uXXXX` keeps the byte identical while leaving the source ASCII, which
 *   is the idiom the repo already uses for its four deliberate NULs.
 * - **In JSX text, a numeric entity**, since a backslash escape there would
 *   render as its own characters.
 * - **A few are simply allowed**, because respelling them loses meaning.
 *
 * **Respelling rendered text is a separate decision from this one.** It is a
 * change to what the product says, and it belongs in a commit that says so.
 *
 * **The fix depends on where the character sits, which is why this is an eslint
 * rule and not a regex.** A right single quote inside a single-quoted string
 * has to become `\'` and inside a comment has to become `'`; a sweep that does
 * not know the difference produced 155 syntax errors in six files on its first
 * run.
 *
 * **The tables below are spelled in escapes, and that is not fastidiousness.**
 * Running this over the repository rewrote `['\u2014', '-']` in this very file
 * to `['-', '-']` -- an em dash in a source file is precisely what the rule
 * respells -- after which it matched nothing and dutifully reported the 4018 em
 * dashes it could no longer fix. A rule that edits source has to be written in
 * the language it enforces.
 */

/** Typography, respelled wherever it appears. */
const PROSE = new Map([
  ['\u2014', '-'], // em dash
  ['\u2013', '-'], // en dash
  ['\u2212', '-'], // minus sign
  ['\u2192', '->'], // rightwards arrow
  ['\u27a1', '->'], // heavy rightwards arrow
  ['\u2026', '...'], // horizontal ellipsis
  ['\u22ef', '...'], // midline ellipsis
  ['\u2018', '\''], // left single quote
  ['\u2019', '\''], // right single quote
  ['\u201c', '"'], // left double quote
  ['\u201d', '"'], // right double quote
  ['\u00ab', '<<'], // left guillemet
  ['\u00bb', '>>'], // right guillemet
  ['\u2039', '<'], // single left guillemet
  ['\u203a', '>'], // single right guillemet
  ['\u2016', '||'], // double vertical line
  ['\u2022', '*'], // bullet
  ['\u2248', '~'], // almost equal to
  ['\u2265', '>='], // greater than or equal
  ['\u2264', '<='], // less than or equal
  ['\u00a7', 'section '], // section sign
  ['\u00b0', ' degrees'], // degree sign
  ['\u2500', '-'], // box drawing, in comment diagrams
  ['\u2502', '|'], // box drawing
  ['\u251c', '+'], // box drawing
  ['\u2514', '+'], // box drawing
])

/**
 * Rendered or meaningful: the same character, spelled as an escape in code and
 * as a word in a comment, where an escape would be noise nobody can read.
 */
const RENDERED = new Map([
  ['\u00b7', '.'], // middle dot -- the report's separator
  ['\u00d7', 'x'], // multiplication sign -- a run count
  ['\u2318', 'Cmd'], // place of interest -- the Mac modifier key
  ['\u25b6', '>'], // black right-pointing triangle
  ['\u2764', '<3'], // heavy black heart
])

/** Kept as itself: respelling loses the meaning. */
const ALLOWED = new Set(['\u00a9']) // copyright sign

const escapeOf = (ch) => '\\u' + ch.codePointAt(0).toString(16).padStart(4, '0')

const entityOf = (ch) => '&#x' + ch.codePointAt(0).toString(16).toUpperCase() + ';'

const named = (ch) => 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')

export default {
  meta: {
    type: 'problem',
    fixable: 'code',
    schema: [],
    messages: {
      banned:
        'Non-ASCII {{code}} in source. Respell it, or spell it as an escape if the ' +
        'character itself is what gets rendered.',
    },
  },

  create(context) {
    const source = context.sourceCode

    return {
      Program() {
        const text = source.getText()
        const comments = source.getAllComments()
        const inComment = (index) =>
          comments.some((comment) => index >= comment.range[0] && index < comment.range[1])

        for (let index = 0; index < text.length; index += 1) {
          const ch = text[index]
          if (ch.charCodeAt(0) < 128 || ALLOWED.has(ch)) continue

          const comment = inComment(index)
          const node = comment ? null : source.getNodeByRangeIndex(index)
          /**
           * **A JSX attribute is not JavaScript.** Its value is a string in the
           * grammar's own sense: backslash escapes are not processed, so
           * `placeholder="a\u2026"` renders the six characters an analyst then
           * reads. Entities are what it does understand, which is the same
           * treatment JSX text needs and for the same reason.
           */
          const jsxAttribute =
            node !== null && node.type === 'Literal' && node.parent?.type === 'JSXAttribute'
          const jsxText = node !== null && (node.type === 'JSXText' || jsxAttribute)
          let replacement = null

          if (comment && PROSE.has(ch)) {
            // Typography in prose: respelled, because a comment renders nothing
            // and `-` says what an em dash says.
            replacement = PROSE.get(ch)
          } else if (comment) {
            // **A comment renders nothing, so an escape says nothing.** A word
            // is the only respelling worth having, and a character with no word
            // is reported without a fix: it is usually the *subject* of the
            // sentence, and only a person can rewrite that.
            replacement = RENDERED.get(ch) ?? null
          } else if (jsxText) {
            // **A numeric entity, which needs no table.** JSX text is not a
            // string, so a backslash escape would render as its own characters;
            // an entity is ASCII in the source and the character on screen.
            replacement = entityOf(ch)
          } else {
            // Anywhere else is a string or template literal, where the escape
            // keeps the byte identical and the source ASCII.
            replacement = escapeOf(ch)
          }

          if (replacement !== null && !comment && !jsxAttribute) {
            const raw = node && node.type === 'Literal' ? node.raw : null
            const quote = raw && (raw[0] === "'" || raw[0] === '"') ? raw[0] : null
            // **A replacement carrying the literal's own quote closes it early.**
            // `install's` becomes `install's`, which ends a single-quoted string
            // mid-word -- the failure that made a regex sweep unusable.
            if (quote && replacement.includes(quote)) {
              replacement = replacement.split(quote).join('\\' + quote)
            }
          }

          context.report({
            loc: {
              start: source.getLocFromIndex(index),
              end: source.getLocFromIndex(index + 1),
            },
            messageId: 'banned',
            data: { code: named(ch) },
            fix:
              replacement === null
                ? undefined
                : (fixer) => fixer.replaceTextRange([index, index + 1], replacement),
          })
        }
      },
    }
  },
}
