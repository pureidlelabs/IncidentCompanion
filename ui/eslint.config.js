import eslintReact from '@eslint-react/eslint-plugin'
import js from '@eslint/js'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import storybook from 'eslint-plugin-storybook'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

import asciiOnly from '../tools/eslint-rules/ascii-only.mjs'
import dialogShape from '../tools/eslint-rules/dialog-shape.mjs'
import jsxEscape from '../tools/eslint-rules/jsx-escape.mjs'
import slotBeforeProps from '../tools/eslint-rules/slot-before-props.mjs'

export default tseslint.config(
  { ignores: ['dist', 'storybook-static', 'node_modules'] },
  js.configs.recommended,
  {
    /**
     * **`public/theme.js` runs in the browser, and this config declares no
     * environment.** Flat config dropped the `env` key, so a global is
     * whatever `languageOptions.globals` says and nothing else - the typed
     * block below sets `globals.browser` for `.ts`/`.tsx` and leaves the one
     * served `.js` file under `js.configs.recommended` alone, which reports
     * `window` and `document` as undefined six times. Declaring the platform
     * is the honest fix; disabling `no-undef` for the file would also hide a
     * genuine typo in a script that nothing typechecks.
     *
     * `server/eslint.config.mjs` carries the same block for the same file.
     */
    files: ['public/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
  ...storybook.configs['flat/recommended'],
  /**
   * **The React rules proper: the ones that read JSX itself**, which
   * `react-hooks` and `react-refresh` do not - no key check on a list, no
   * `dangerouslySetInnerHTML` beside children, no listener left attached.
   *
   * **`eslint-plugin-react` held this slot and could not keep it.** It peers on
   * eslint `^9.7`, published nothing after 7.37.5, and had already cost this
   * config a workaround: `version: 'detect'` calls `context.getFilename()`,
   * which eslint 10 removed, so the version had to be pinned by hand or every
   * rule asking for it died with a TypeError. A plugin needing a pin to survive
   * a major it does not claim to support is one major from needing a fork.
   *
   * `recommended-typescript` rather than `recommended`, which drops the rules
   * the compiler already decides: `prop-types` on a tree with no PropTypes,
   * duplicate JSX props, an undefined component. It also never asks for React
   * in scope, so the separate `jsx-runtime` block React 19 needed is gone.
   */
  {
    files: ['**/*.{ts,tsx}'],
    ...eslintReact.configs['recommended-typescript'],
    // Pinned rather than detected, as the old plugin was. Detection reads
    // `package.json` from disk per file; the version is already stated once in
    // `ui/package.json` and this is the second place, not the first.
    settings: { 'react-x': { version: '19.2' } },
  },
  {
    /**
     * **Nine rules that both plugins ship, kept on the React team's copy.**
     * `eslint-plugin-react-hooks` 7.1.1 is the compiler-backed official
     * plugin, it already declares an eslint 10 peer, and this config has been
     * configuring it since before the swap. The upstream answer is the
     * `disable-conflict-eslint-plugin-react-hooks` preset, which resolves the
     * overlap the other way - it silences `react-hooks/*` and keeps these.
     *
     * **Leaving both on is not a stricter config, it is a doubled one**: the
     * same defect reported twice under two names, and two rule sets to keep
     * an override in step with.
     */
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@eslint-react/error-boundaries': 'off',
      '@eslint-react/exhaustive-deps': 'off',
      '@eslint-react/purity': 'off',
      '@eslint-react/rules-of-hooks': 'off',
      '@eslint-react/set-state-in-effect': 'off',
      '@eslint-react/set-state-in-render': 'off',
      '@eslint-react/static-components': 'off',
      '@eslint-react/unsupported-syntax': 'off',
      '@eslint-react/use-memo': 'off',
    },
  },
  {
    /**
     * **Six rules that report a preference rather than a defect.** Between
     * them they were 92 of the 106 findings this plugin added, and a warning
     * list that long is one nobody reads - which costs the fourteen findings
     * underneath it that are worth reading.
     *
     * The test each failed: **can the code it flags be wrong?** None of these
     * can answer yes.
     */
    files: ['**/*.{ts,tsx}'],
    rules: {
      /**
       * **Naming, which this project decides elsewhere.** A ref must end in
       * `Ref`, a context in `Context`, a `useId` result in `Id`. 52 hits, no
       * defect among them - `import-data.tsx` names two refs after the thing
       * they hold, which reads better than the suffix would.
       */
      '@eslint-react/naming-convention-ref-name': 'off',
      '@eslint-react/naming-convention-context-name': 'off',
      '@eslint-react/naming-convention-id-name': 'off',
      /**
       * **Both spellings are correct in React 19**, and these ask for the
       * newer one at 33 sites. `use()` over `useContext()` and `<Context>`
       * over `<Context.Provider>` are migrations to schedule, not defects to
       * report on every run - and a lint that asks for a refactor it cannot
       * finish reports the same 33 lines for ever.
       */
      '@eslint-react/no-use-context': 'off',
      '@eslint-react/no-context-provider': 'off',
      /**
       * **Lazy initial state is worth it when the initialiser is expensive,
       * and the rule cannot see cost.** It fires on any call in the initial
       * argument, so `useState(emptyDraft())` reads the same to it as a parse
       * of the whole case.
       */
      '@eslint-react/use-state': 'off',
    },
  },
  /**
   * **Accessibility, which this config never had and the project already had a
   * rule about.** `data-cell.tsx` says in prose that *"a `<div onClick>` here
   * is the single most common way an editable table becomes
   * keyboard-inaccessible"* -- and `NewReportDialog`'s layout picker was
   * exactly that: a clickable `<div>` with no role, no `tabIndex` and no key
   * handler, unreachable by keyboard. The rule was written down, enforced by
   * hand in one component, and violated in another. That is a claim belonging
   * in a linter rather than a docstring.
   *
   * **Installed with `--legacy-peer-deps`, and now the only thing forcing it.**
   * 6.10.2 peers on eslint `^9` and has published nothing since October 2024.
   * `eslint-plugin-react` was the other half of that flag until it was replaced
   * above, so `.npmrc` and `eslintPeers.test.ts` both watch this package now.
   *
   * **There is no successor to swap to**, which is what separates this from the
   * React half: `jsx-a11y` is the only implementation of these checks, and the
   * rules encode WAI-ARIA rather than a framework version, so inactivity here
   * says less than it did there. The flag stays until upstream widens the peer.
   */
  {
    files: ['**/*.{ts,tsx}'],
    ...jsxA11y.flatConfigs.recommended,
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      /**
       * **Every hit was a dialog opening on its first field**, which is what a
       * modal is expected to do: it has already taken focus, and leaving the
       * caret outside the form makes the analyst tab into it. The rule targets
       * autofocus on a *page*, where it moves somebody who did not ask to be
       * moved. Nine sites, all forms inside dialogs or panes.
       */
      'jsx-a11y/no-autofocus': 'off',
      /**
       * **Fires on the two primitives that take their content from callers.**
       * `CardTitle` is an `<h3>` with a props spread and `Label` a `<label>`
       * with one, so the rule sees an empty element and the consumer supplies
       * the child. It cannot tell that apart from a genuinely empty heading.
       */
      'jsx-a11y/heading-has-content': 'off',
      /**
       * **A `<label>` wrapping a Base UI `Checkbox` is not recognised.** The
       * checkbox renders a `<button role="checkbox">` rather than an
       * `<input>`, so the rule finds no control inside a label that does in
       * fact label one.
       */
      'jsx-a11y/label-has-associated-control': 'off',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    // Typed linting is scoped here rather than applied at the top level: the
    // rules need a program, and `eslint.config.js` is not in one.
    extends: [
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        // Named explicitly rather than `projectService: true`: the root
        // `tsconfig.json` is a solution file with `files: []`, so the service
        // finds no program for `.storybook/` and reports every file there as
        // a parse error.
        project: ['./tsconfig.app.json', './tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      // The repository-wide rules, kept at the root so the server enforces the
      // same ones rather than growing a second copy.
      local: {
        rules: {
          'ascii-only': asciiOnly,
          'dialog-shape': dialogShape,
          'jsx-escape': jsxEscape,
          'slot-before-props': slotBeforeProps,
        },
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // `any` is a defect. Where the generated types are too weak the answer
      // is `unknown` and a narrowing at the boundary, which is what
      // `src/api/case.ts` does once per endpoint.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      // Reads worse than it is on `void client.invalidateQueries(...)`, which
      // is the documented way to say "not awaited, on purpose".
      '@typescript-eslint/no-confusing-void-expression': 'off',
      /**
       * **`''` is this app's unset, so `||` on a string is deliberate.** The
       * server publishes a blank row with `''` for every text field rather than
       * null - `specs.controller`'s `blankRow` says why: a reader calls
       * `.trim()` on it. So `title || reference || 'Untitled case'` has to fall
       * through an empty title, and `??` would keep it and render nothing.
       * Every one of the six sites this fired on wanted the empty string to
       * fall through; none was a null-vs-falsy mistake.
       */
      '@typescript-eslint/prefer-nullish-coalescing': [
        'error',
        { ignorePrimitives: { string: true } },
      ],
      // Source is ASCII: a byte over 0x7F is a corrupted write until shown
      // otherwise. -> tools/eslint-rules/ascii-only.mjs
      'local/ascii-only': 'error',
      'local/dialog-shape': 'error',
      // The other half of `ascii-only`: that rule decides how a
      // character is spelled, this one decides where the spelling
      // renders as itself rather than as five characters.
      // -> tools/eslint-rules/jsx-escape.mjs
      'local/jsx-escape': 'error',
      // `data-slot` is what every test, probe and stylesheet here selects on,
      // and JSX applies attributes in source order - so one written after a
      // spread throws the call site's away in silence.
      // -> tools/eslint-rules/slot-before-props.mjs
      'local/slot-before-props': 'error',
      /**
       * **`@contract/*` is types only, and this is what says so.** An
       * `import type` is erased before the bundler runs, so the client
       * compiles against the server's wire module with nothing reaching the
       * bundle. A *value* import would pull zod and the schemas into the
       * client, which `ui/tsconfig.app.json` documents as the thing that must
       * not happen.
       *
       * **`tsc` cannot refuse it and neither can a missing dependency.**
       * `vite.config.ts` aliases `@contract`, and zod resolves through
       * `better-auth` whether or not `package.json` names it - measured, a
       * value import typechecks with zod removed from the client's own
       * dependencies. The lint is the only instrument that can be right here.
       *
       * The base rule, not the typescript-eslint extension: ESLint has
       * handled `allowTypeImports` natively since 9.37 and the extension is
       * deprecated.
       */
      'no-restricted-imports': ['error', {
        patterns: [{
          /**
           * **Three exceptions, and they are exceptions for different reasons.**
           *
           * `*.lists` imports nothing at all, which
           * `server/src/domain/vocabularies.lists.test.ts` holds for every one
           * of them: the picker needs the tactic list as a value and the
           * change feed needs `isScope`, and neither drags zod in behind it.
           *
           * `collections` is the entity schemas, and it does drag zod in - on
           * purpose, since 2026-08-20. The dialog runs `safeParse` on the
           * draft so a length, a format or a cross-field rule is refused by
           * the field that is wrong rather than by a save that fails with the
           * screen already full. What the browser bundles by reaching through
           * it is held by `server/src/domain/browser-safe.test.ts`, which
           * walks the closure and fails on any package but zod.
           *
           * The `*-shape` modules are pure functions and the patterns under
           * them, answering what a value *looks* like. They reach nothing at
           * runtime - `indicator-shape`'s only import is `import type`, which
           * is erased, and `malware-shape` imports nothing at all. Each is an
           * entry point in `browser-safe.test.ts`, so the closure is walked
           * rather than argued from, and a test holds the two lists level.
           *
           * **Everything else stays types-only**, and the reason is unchanged:
           * `server/src/domain` also holds modules that reach a Drizzle table.
           */
          group: [
            '@contract/*',
            '!@contract/*.lists',
            '!@contract/collections',
            '!@contract/indicator-shape',
            '!@contract/malware-shape',
          ],
          allowTypeImports: true,
          message:
            'Types only, except @contract/*.lists, @contract/collections and ' +
            'the @contract/*-shape advice modules. A value import from anywhere ' +
            'else can reach a Drizzle table.',
        }],
        paths: [{
          name: 'zod',
          /**
           * **Still banned, and the entity schemas do not weaken it.** The
           * client imports schemas and never declares one: `safeParse` needs
           * no `z`, and its result types are inferred. A `z.object(...)` in
           * `ui/src` is a second declaration of a shape the server already
           * owns, which is the thing this ban is about rather than the
           * bundle.
           */
          message:
            'The client declares no schemas. Import one from @contract/collections, ' +
            'or the type from @contract/*.',
        }],
      }],
      // `ignoreRestSiblings` is the point: destructuring a field out to build
      // the rest is how a test strips `version` and `base` from a captured
      // body, and the name it binds is never meant to be read.
      '@typescript-eslint/no-unused-vars': ['error', {
        args: 'after-used',
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
    },
  },
  {
    // shadcn/ui colocates a component with the variant table and the helper
    // that classifies a value for it. Splitting them to satisfy fast refresh
    // would put the token mapping a file away from the only thing that reads
    // it, for a dev-server nicety.
    files: ['src/components/ui/**'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // A test asserts against shapes the runtime hands back untyped, and
    // indexes fixtures it has just built; a story exports story objects beside
    // the component it renders.
    files: ['**/*.test.{ts,tsx}', '**/*.stories.tsx', '.storybook/**'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'react-refresh/only-export-components': 'off',
      // A test is not bundled, and checking the client's mapping against the
      // server's own schema is the point of `sentinel-import/contract.test.ts`.
      'no-restricted-imports': 'off',
    },
  },
)
