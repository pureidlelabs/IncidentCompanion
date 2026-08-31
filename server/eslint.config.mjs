/**
 * The server's lint, which it did not have.
 *
 * **Nothing had ever linted this tree.** `npm run check` is a typecheck and a
 * test run; the client has carried eslint with typed rules since it was
 * scaffolded, and the backend that serves it had none. So this starts from a
 * codebase with years of habits nobody has ever been told about, and the first
 * run is a measurement rather than a gate.
 *
 * **Type-aware, because the untyped half is the cheap half.** What is worth
 * catching here -- a floating promise, an `any` reaching a route handler, a
 * template literal stringifying an object into a customer's report -- can only
 * be seen with a program behind it. `tsconfig.json` and `tsconfig.test.json`
 * are named explicitly for the same reason the client names its two: a
 * `projectService` finds no program for a file outside both and reports it as a
 * parse error.
 *
 * **`@darraghor/eslint-plugin-nestjs-typed` is not here, and that is a
 * decision.** It is the obvious Nest plugin and it peer-requires
 * `class-validator`, which this server does not have: validation is Zod's,
 * decided when Zod was put in the lead of everything crossing the API. Its DTO
 * half is about decorators nothing here writes. Its Swagger half would apply --
 * that is worth revisiting when somebody wants it, with the mismatch understood
 * rather than discovered.
 */
import js from '@eslint/js'
import drizzle from 'eslint-plugin-drizzle'
import n from 'eslint-plugin-n'
import playwright from 'eslint-plugin-playwright'
import regexp from 'eslint-plugin-regexp'
import tseslint from 'typescript-eslint'

import asciiOnly from '../tools/eslint-rules/ascii-only.mjs'

export default tseslint.config(
  {
    // `vendor/` is redoc's shipped bundle: 1020 of this config's first 1519
    // findings were in one minified file nobody here wrote.
    ignores: ['dist', 'node_modules', 'test-results', 'playwright-report', 'drizzle', 'vendor'],
  },
  js.configs.recommended,
  {
    /**
     * The browser-side scripts run in the browser, not in Node - the geometry
     * probes, and `public/theme.js`, which the app serves to set the ground
     * before first paint.
     *
     * **`.js` on purpose** - see its own docstring - so it lands under
     * `js.configs.recommended` with Node's globals and reports `document` and
     * `getComputedStyle` as undefined sixteen times. Declaring the browser
     * environment is the honest fix; disabling `no-undef` for the file would
     * also hide a genuine typo in 364 lines nothing else typechecks.
     */
    files: [
      'e2e/visual/probe.js',
      'public/**/*.js',
      // The Storybook capture scripts. Node on the outside, and the half that
      // reads `document` is inside a `page.evaluate` callback, which eslint
      // cannot see into -- so the file reports Node's globals against browser
      // code. Same trade as the line above.
      '.probe.mjs',
      '.shot-blocks.mjs',
      '.shot-story.mjs',
    ],
    languageOptions: {
      globals: {
        document: 'readonly',
        window: 'readonly',
        getComputedStyle: 'readonly',
        Node: 'readonly',
        Element: 'readonly',
        HTMLElement: 'readonly',
      },
    },
  },
  {
    /**
     * The `.mjs` scripts run in Node, and `js.configs.recommended` declares no
     * environment at all -- flat config dropped the `env` key, so a global is
     * whatever `languageOptions.globals` says and nothing else. Without this
     * `stack.mjs` reports `process` and `console` undefined ten times, which
     * reads as a broken script rather than as a config that never named its
     * platform.
     *
     * Spelled out rather than pulled from the `globals` package, matching the
     * browser block above: three names cost less than a dependency.
     */
    files: ['**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        URL: 'readonly',
      },
    },
  },
  {
    files: ['**/*.ts', '**/*.mts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.test.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { local: { rules: { 'ascii-only': asciiOnly } }, drizzle, regexp, n },
    rules: {
      /**
       * **A delete or update with no `where` reaches every row in the table**,
       * and in this app a table holds every case. Zero violations the day this
       * was added, and that is the argument for it rather than against: the
       * shipping path is correct today and was guarded by nothing but
       * attention. A green break-verify in `auth` -- "passed with the `where`
       * deleted" -- is the same failure mode arriving somewhere else.
       *
       * `drizzleObjectName` is the list of handles this tree calls the
       * database by. A handle missing from it is a door the rule cannot see.
       */
      'drizzle/enforce-delete-with-where': ['error', { drizzleObjectName: ['db', 'tx', 'seed'] }],
      'drizzle/enforce-update-with-where': ['error', { drizzleObjectName: ['db', 'tx', 'seed'] }],
      /**
       * **Catastrophic backtracking, in a product that runs regexes over
       * analyst-supplied incident data** -- defang, the Sentinel import, prose
       * parsing. Zero hits today; the point is that a regex written next month
       * against a pasted indicator cannot quietly become a denial of service.
       */
      'regexp/no-super-linear-backtracking': 'error',
      'regexp/no-empty-capturing-group': 'error',
      'regexp/no-useless-backreference': 'error',
      // 68 `node:` imports and no bare ones, so this locks a convention that is
      // already total rather than fixing anything.
      'n/prefer-node-protocol': 'error',
      // Source is ASCII: a byte over 0x7F is a corrupted write until shown
      // otherwise. -> tools/eslint-rules/ascii-only.mjs
      'local/ascii-only': 'error',
      // **The same convention the client's config carries**, so a discard is
      // spelled one way across both halves. `_` marks a binding that exists to
      // be *declared* rather than read -- a type-level assertion in a contract
      // test, a parameter kept for a signature -- and `ignoreRestSiblings`
      // covers destructuring a field out to build the rest.
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
    /**
     * **An unawaited web-first assertion never runs, and the test passes.**
     * `e2e/` is the tier `CLAUDE.md` names as the only one that can see a
     * client and its route disagreeing, so a silently-skipped assertion there
     * is the highest-consequence undetectable failure in the repository.
     *
     * Zero violations when this was added -- 34 of the 68 `expect(` lines
     * already await, and none of the rest is a web-first matcher. It closes
     * the class for free rather than repairing anything.
     *
     * `no-skipped-test` is **off**: `support/app.ts` calls `test.skip(true, why)`
     * as a runtime decision, which is the legitimate form and what the rule
     * cannot tell from a skip somebody left behind.
     */
    files: ['e2e/**/*.ts'],
    ...playwright.configs['flat/recommended'],
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      'playwright/no-skipped-test': 'off',
      /**
       * **This tier walks screens whose shape is data**, so a conditional is
       * how it copes with a section a case does not have. 38 of them, and
       * `prodding.spec.ts` -- which presses every control on every screen --
       * is most of that. The rule is right for a test with a fixed subject
       * and wrong for one whose subject is the case in front of it.
       */
      'playwright/no-conditional-in-test': 'off',
      'playwright/no-conditional-expect': 'off',
    },
  },
  {
    /**
     * **Two specs capture rather than assert, and that is their job.**
     * `visual/sweep.spec.ts` measures every section and prints what it found
     * for `visual-check` to read; `language-look.spec.ts` photographs a report
     * in two languages. Neither has a proposition to assert -- the judgement
     * is a person's, or the baseline diff's.
     *
     * Scoped to these two rather than to `e2e/`, because `expect-expect`
     * earned its place the day it was added: it found `report-screen.spec.ts`
     * claiming to draw a report's sections while only photographing them.
     */
    files: ['e2e/visual/sweep.spec.ts', 'e2e/language-look.spec.ts'],
    rules: { 'playwright/expect-expect': 'off' },
  },
  {
    /**
     * **A fake is shaped like the thing it stands in for.** A stub replacing
     * an async method, an async generator standing in for a stream, a
     * `poolThat(async () => ...)` -- none has anything to await, and dropping
     * `async` would change the return type and stop it substituting. The rule
     * is right about source and wrong about every one of these by
     * construction.
     */
    files: ['**/*.test.ts', 'src/test/**', 'e2e/**'],
    rules: {
      /**
       * **A fixture truncates a table on purpose**, which is the one legitimate
       * unguarded delete. Measured when the rule was added: 38 of them, every
       * one a teardown, and **zero in shipping source** -- so this exemption
       * is what keeps the rule pointed at the thing it is for.
       */
      'drizzle/enforce-delete-with-where': 'off',
      'drizzle/enforce-update-with-where': 'off',
      '@typescript-eslint/require-await': 'off',
      /**
       * **A test asserts against what the runtime hands back, which is
       * untyped.** A response body is `unknown` until something narrows it,
       * and narrowing it in a test would restate the schema the test exists
       * to check. The client's config carries the same three for the same
       * reason.
       */
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
)
