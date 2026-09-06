import { RuleTester } from 'eslint'
import parser from '@typescript-eslint/parser'
import { commentInventory, emptyComment, reviewComment } from './comment-hygiene.mjs'

const tester = new RuleTester({
  languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx: true } } },
})
tester.run('empty-comment', emptyComment, {
  valid: [
    'const x = "/** */";',
    'const x = `/* */`;',
    '/** A constraint. */ const x = 1;',
    'const x = <div>/* */</div>;',
    '//\nconst x = 1;',
  ],
  invalid: [
    { code: '/** */ const x = 1;', errors: [{ messageId: 'empty' }], output: null },
    { code: 'const x = <div>{/* */}</div>;', errors: [{ messageId: 'empty' }], output: null },
    { code: '/**\n *\n */ const x = 1;', errors: [{ messageId: 'empty' }], output: null },
  ],
})
tester.run('review-comment', reviewComment, {
  valid: [
    'const x = "previously 200 tests";',
    'const x = <div>previously 200 tests</div>;',
    '// @ts-expect-error previously 200 tests\nconst x = 1;',
    '// used\nconst x = 1;\n// to be smaller',
  ],
  invalid: [
    { code: 'const x = 1; // previously 200 tests', errors: [{ messageId: 'count' }, { messageId: 'history' }], output: null },
    { code: 'const x = <div>{/* previously */}</div>;', errors: [{ messageId: 'history' }], output: null },
    { code: '// used\n// to be smaller\nconst x = 1;', errors: [{ messageId: 'history' }], output: null },
    { code: '// This constraint belongs beside the guard.\nconst x = 1;\n// This constraint belongs beside the guard.\nconst y = 2;', errors: [{ messageId: 'duplicate' }], output: null },
  ],
})

// The extraction the ratio and the review queue both stand on. A span one
// character out moves a line between two categories, and nothing downstream
// would say so.
const span = (comments) => [{ message: JSON.stringify(comments) }]

tester.run('comment-inventory', commentInventory, {
  valid: [],
  invalid: [
    {
      code: 'const a = "// not a comment"; const b = /\\/\\* no \\*\\//;',
      errors: span([]),
      output: null,
    },
    {
      code: 'const a = 1; // why',
      errors: span([{ line: 1, col: 13, endLine: 1, endCol: 19, text: '// why', kind: 'ordinary', protected: false }]),
      output: null,
    },
    {
      code: 'const a = <div>/* text */{/* real */}</div>;',
      errors: span([{ line: 1, col: 26, endLine: 1, endCol: 36, text: '/* real */', kind: 'ordinary', protected: false }]),
      output: null,
    },
    {
      code: '// one\n// two\nconst a = 1;\n// three\n\n// four',
      errors: span([
        { line: 1, col: 0, endLine: 2, endCol: 6, text: '// one\n// two', kind: 'ordinary', protected: false },
        { line: 4, col: 0, endLine: 4, endCol: 8, text: '// three', kind: 'ordinary', protected: false },
        { line: 6, col: 0, endLine: 6, endCol: 7, text: '// four', kind: 'ordinary', protected: false },
      ]),
      output: null,
    },
    {
      code: '/**\n * A claim.\n */\nexport const a = 1;',
      errors: span([{ line: 1, col: 0, endLine: 3, endCol: 3, text: '/**\n * A claim.\n */', kind: 'jsdoc', protected: false }]),
      output: null,
    },
    {
      code: '/* @license MIT */\nconst a = 1;',
      errors: span([{ line: 1, col: 0, endLine: 1, endCol: 18, text: '/* @license MIT */', kind: 'ordinary', protected: true }]),
      output: null,
    },
  ],
})
