import tseslint from 'typescript-eslint'
import { RuleTester } from 'eslint'

import rule from '../../../../tools/eslint-rules/dialog-shape.mjs'

/**
 * The rule that keeps a dialog from sizing itself, attacked rather than
 * demonstrated.
 *
 * **A lint rule is a prescription, and a prescription can be false.** This one
 * exists because prose already failed at the same job: `dialog.tsx`'s own
 * docstring says the width is the spec's decision and not the caller's, and
 * three files wrote their own width anyway. A rule that misses those three
 * would be the same failure with more ceremony.
 *
 * Every invalid case below is a real line from this repository, not an
 * invention: `max-w-2xl` from `NewReportDialog` and `HeaderSearch`,
 * `max-w-xl` with `p-0` and `top-[15%]` from `CommandPalette`, and the
 * `max-h-[calc(100vh-4rem)]` the new-case pair carried.
 */
const tester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true }, ecmaVersion: 'latest', sourceType: 'module' },
  },
})

// **At the top level, not inside a test.** `RuleTester` calls the framework's
// own `describe` and `it`, so nesting it raises "calling the suite function
// inside test function is not allowed".
tester.run('local/dialog-shape refuses a dialog that sizes or places itself', rule, {
  valid: [
    // An archetype, which is the whole of what a caller may say.
    { code: '<DialogContent size="form" />' },
    { code: '<DialogContent size="workbench">{body}</DialogContent>' },
    // Classes that are not size or placement stay a caller's business.
    { code: '<DialogContent className="gap-4 text-sm" />' },
    { code: '<DialogContent className={cn("flex flex-col gap-4")} />' },
    // The rule is scoped to the dialog frame, so a body may still size
    // itself -- a table inside one legitimately caps its own height.
    { code: '<div className="max-h-[70vh] overflow-y-auto" />' },
    { code: '<DialogPopup className="max-w-lg" />' },
  ],
  invalid: [
    {
      code: '<DialogContent className="max-w-2xl" />',
      errors: [{ messageId: 'sized' }],
    },
    {
      code: '<DialogContent className="max-h-[calc(100vh-4rem)] overflow-y-auto" />',
      errors: [{ messageId: 'sized' }],
    },
    // The palette's three at once: two sizing, one placement.
    {
      code: '<DialogContent className="top-[15%] max-w-xl -translate-y-0 p-0" />',
      errors: [{ messageId: 'placed' }, { messageId: 'sized' }, { messageId: 'placed' }],
    },
    // Hidden inside `cn`, which is how most of this repo writes classes.
    {
      code: '<DialogContent className={cn("w-[42rem]", open && "h-[30rem]")} />',
      errors: [{ messageId: 'sized' }, { messageId: 'sized' }],
    },
    // Behind a responsive prefix, which is how a rule like this gets
    // quietly bypassed once it exists.
    {
      code: '<DialogContent className="sm:max-w-3xl" />',
      errors: [{ messageId: 'sized' }],
    },
  ],
})
