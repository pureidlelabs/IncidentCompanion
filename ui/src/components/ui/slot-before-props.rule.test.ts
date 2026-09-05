import tseslint from 'typescript-eslint'
import { RuleTester } from 'eslint'

import rule from '../../../../tools/eslint-rules/slot-before-props.mjs'

/**
 * The rule that keeps a component's `data-slot` from eating the caller's,
 * attacked rather than demonstrated.
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
tester.run('local/slot-before-props refuses a data-slot a spread can overwrite', rule, {
  valid: [
    // The shape the whole kit is being moved onto.
    { code: '<AriaLink data-slot="link" {...props} />' },
    // No spread at all: nothing can overwrite it.
    { code: '<span data-slot="button-pending" aria-hidden />' },
    { code: '<AriaButton data-slot="button" className={c}>{children}</AriaButton>' },
    // Another attribute after a spread is the caller being overridden on
    // purpose, which is a different decision and not this rule's business.
    { code: '<AriaLink {...props} className={c} aria-hidden />' },
    // A spread that is not the caller's still counts, so the rule needs no
    // opinion about which is which - first attribute, always.
    { code: '<AriaButton data-slot="button" {...(refused ? { disabled: true } : {})} />' },
    // A `data-slot` read out of a variable name is not this attribute.
    { code: '<div {...props} data-testid="slot" />' },
    { code: '<div {...props} slot="drag" />' },
    // `avatar.tsx`'s shape, whole: the parent names its slot above its spread,
    // and the children below it name theirs. A parent's spread cannot reach a
    // child's attribute, and the rule reads one element's own attribute list --
    // so the two children are valid however far down the file they sit.
    {
      code: `<span data-slot="avatar" role="img" {...props} className={c}>
        <img src={src} alt="" data-slot="avatar-image" className={i} />
        <span aria-hidden data-slot="avatar-fallback" className="leading-none">{f}</span>
      </span>`,
    },
  ],
  // The fixer re-indents rather than leaving it to prettier: this repository
  // is not prettier-clean, so a formatting pass over a fixed file rewrites the
  // rest of it too. One line in, one line out; a wrapped attribute list keeps
  // its own indent.
  invalid: [
    {
      code: '<AriaLink {...props} data-slot="link" />',
      errors: [{ messageId: 'after' }],
      output: '<AriaLink data-slot="link" {...props} />',
    },
    // Two spreads with the attribute between them: still overwritten by the
    // first, and the second is not what put it there.
    {
      code: '<AriaButton {...props} data-slot="button" {...extra} />',
      errors: [{ messageId: 'after' }],
      output: '<AriaButton data-slot="button" {...props} {...extra} />',
    },
    // The comment travels with the attribute. Left behind, it would sit above
    // the spread saying the opposite of what the line does.
    {
      code: '<X {...props}\n // named by the caller\n data-slot="x" />',
      errors: [{ messageId: 'after' }],
      output: '<X // named by the caller\n data-slot="x"\n{...props} />',
    },
  ],
})
