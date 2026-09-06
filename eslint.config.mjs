/**
 * The rule that applies to every line in the repository, wherever it lives.
 *
 * **One config at the root, because the alphabet is not a package's business.**
 * `server/` and `ui/` are separate packages with separate dependency trees, and
 * a copy of this rule in each is two things to keep true. This one runs over
 * both, plus the tooling and the scripts.
 *
 * **`.mjs` rather than `.ts`.** A TypeScript config needs `jiti` installed to
 * load at all, and there is nothing here a type would catch -- the whole file
 * is one rule and a list of globs.
 *
 * **No type-aware linting.** This rule reads characters, so it needs a parser
 * and not a program; wanting a program would mean a `tsconfig` per package
 * before it could run at all, and the two packages disagree about theirs.
 *
 * The client keeps its own `ui/eslint.config.js` for everything that *is* a
 * package's business -- hooks, React, the typed rules.
 */
import parser from '@typescript-eslint/parser'

import asciiOnly from './tools/eslint-rules/ascii-only.mjs'
import jsxEscape from './tools/eslint-rules/jsx-escape.mjs'
import dialogShape from './tools/eslint-rules/dialog-shape.mjs'
import { commentInventory, emptyComment, reviewComment } from './tools/eslint-rules/comment-hygiene.mjs'

export default [
  {
    ignores: [
      '**/node_modules/**',
      // Python's virtualenv carries Playwright's own vendored JavaScript,
      // which is somebody else's source and not ours to respell.
      '.venv/**',
      // Vendored third-party bundles: somebody else's source, replaced
      // wholesale on the next update. The sweep respelled an ellipsis inside
      // redoc's minified CSS before this was here.
      '**/vendor/**',
      '**/dist/**',
      '**/storybook-static/**',
      '**/test-results/**',
      '**/playwright-report/**',
      '**/coverage/**',
      // Generated from the server's own schemas: fix the generator, not this.
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx,mts,cts}'],
    /**
     * **Inline comments are ignored, deliberately.** A file carrying
     * `eslint-disable` for a rule this config does not define would error as
     * an unknown rule -- and more to the point, a corrupted byte is not
     * something a comment should be able to excuse.
     */
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'off' },
    languageOptions: {
      parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      local: {
        rules: {
          'ascii-only': asciiOnly,
          'dialog-shape': dialogShape,
          'jsx-escape': jsxEscape,
          'empty-comment': emptyComment,
          'review-comment': reviewComment,
          'comment-inventory': commentInventory,
        },
      },
    },
    rules: {
      'local/ascii-only': 'error',
      'local/dialog-shape': 'error',
      // The other half of `ascii-only`: it decides how a character is
      // spelled, this decides where that spelling renders as itself.
      'local/jsx-escape': 'error',
      'local/empty-comment': 'error',
      // Candidates for the comment review, not a policy. Turn it on with
      // `--rule 'local/review-comment:warn'` when building a queue.
      'local/review-comment': 'off',
      // The corpus collector. `tools/comment-inventory.mjs` turns it on for
      // one run; it reports no defect, only what it found.
      'local/comment-inventory': 'off',
    },
  },
]
