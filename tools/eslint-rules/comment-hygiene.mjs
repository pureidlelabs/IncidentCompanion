/**
 * Two rules about the shape of a comment, neither of which reads what it means.
 *
 * `empty-comment` is objective and errors: a block with no claim in it. No
 * fixer is offered, because deleting prose is a reviewed act.
 *
 * `review-comment` is off by default and produces candidates for the queue in
 * `.claude/scripts/comment_review.py` -- a warning is a location worth reading,
 * never a verdict. It supplies no ledger identity; feed the locations into the
 * existing review rather than growing a second record.
 */
const protectedComment = (value) =>
  /(?:@(?:ts-|license|preserve)|\beslint\b|prettier-ignore|istanbul|c8 ignore|SPDX|copyright)/i.test(value)

const clean = (value) => value.replace(/^\s*\* ?/gm, '').replace(/\s+/g, ' ').trim()

/** Line comments joined into one run, broken by any code or blank line between them. */
export function runs(source) {
  const result = []
  for (const comment of source.getAllComments()) {
    if (comment.type === 'Shebang') continue
    const previous = result.at(-1)
    const gap = previous ? source.text.slice(previous.range[1], comment.range[0]) : ''
    if (previous?.type === 'Line' && comment.type === 'Line' &&
        /^\r?\n[^\S\r\n]*$/.test(gap)) {
      previous.value += '\n' + comment.value
      previous.range[1] = comment.range[1]
      previous.loc.end = comment.loc.end
    } else {
      result.push({ type: comment.type, value: comment.value,
        range: [...comment.range], loc: { start: comment.loc.start, end: comment.loc.end } })
    }
  }
  return result
}

export const emptyComment = {
  meta: {
    type: 'problem', schema: [],
    messages: { empty: 'Empty comment. Restore its claim or remove the block after review.' },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (comment.type === 'Block' && clean(comment.value) === '') {
            context.report({ loc: comment.loc, messageId: 'empty' })
          }
        }
      },
    }
  },
}

/** Which store a comment's prose belongs to, so a total cannot hide where it lives. */
const kindOf = (comment) =>
  comment.type === 'Shebang' ? 'directive'
    : comment.type === 'Block' && comment.value.startsWith('*') ? 'jsdoc'
      : 'ordinary'

/**
 * Every comment in the file, as one JSON message for `tools/comment-inventory.mjs`.
 *
 * Off in normal linting. The result travels as a lint message rather than in a
 * closure so that ESLint can still spread the parse across workers: a closure
 * is not cloneable, and ESLint refuses to start rather than lose the results.
 *
 * Columns are code-unit offsets, which `local/ascii-only` makes identical to
 * character offsets over every file this runs on.
 */
export const commentInventory = {
  meta: { type: 'suggestion', schema: [] },
  create(context) {
    return {
      'Program:exit'(node) {
        const comments = runs(context.sourceCode).map((comment) => ({
          line: comment.loc.start.line,
          col: comment.loc.start.column,
          endLine: comment.loc.end.line,
          endCol: comment.loc.end.column,
          text: comment.type === 'Line'
            ? comment.value.split('\n').map((value) => `//${value}`).join('\n')
            : `/*${comment.value}*/`,
          kind: kindOf(comment),
          protected: protectedComment(comment.value),
        }))
        context.report({ node, message: JSON.stringify(comments) })
      },
    }
  },
}

export const reviewComment = {
  meta: {
    type: 'suggestion', schema: [],
    messages: {
      count: 'Review this count of tests, files or suites. Keep fixture quantities; move transient repository measurements to the commit message.',
      history: 'Review the historical wording. Preserve any enduring constraint or coverage boundary when rewriting.',
      duplicate: 'Identical comment text also occurs at line {{line}} in this file. Check whether each location needs it.',
    },
  },
  create(context) {
    return {
      Program() {
        const seen = new Map()
        for (const comment of runs(context.sourceCode)) {
          if (protectedComment(comment.value)) continue
          const value = clean(comment.value)
          if (/\b\d[\d,]*\s+(?:tests?|files?|suites?)\b/i.test(value)) {
            context.report({ loc: comment.loc, messageId: 'count' })
          }
          if (/\b(?:used to|an earlier version|before this change|the old version|previously)\b/i.test(value)) {
            context.report({ loc: comment.loc, messageId: 'history' })
          }
          if (value.length >= 30 && seen.has(value)) {
            context.report({ loc: comment.loc, messageId: 'duplicate', data: { line: seen.get(value) } })
          }
          if (!seen.has(value)) seen.set(value, comment.loc.start.line)
        }
      },
    }
  },
}
