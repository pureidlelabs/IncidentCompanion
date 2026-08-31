import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)', '../src/**/*.mdx'],
  addons: ['@storybook/addon-a11y', '@storybook/addon-mcp', '@storybook/addon-docs'],
  framework: { name: '@storybook/react-vite', options: {} },
  // A static build you open from disk, with no server behind it. Every
  // story renders from `src/fixtures/`; a story needing the API is a story
  // that cannot be opened in the morning.
  staticDirs: [],
  /**
   * **The props table is generated from the types, not written twice.**
   *
   * `react-docgen-typescript` reads each component's exported prop interface
   * and the JSDoc on every member, so a prop documented in the source is
   * documented on the page - and a prop that is added and not documented shows
   * up bare, which is the signal.
   *
   * **`shouldExtractLiteralValuesFromEnum`** is what turns a union like
   * `'sm' | 'md' | 'lg'` into a select control rather than a text box, so the
   * page can be poked at rather than only read.
   *
   * Node modules are skipped: without the filter every React Aria prop the kit
   * re-exports arrives in the table, and a Button's page opens with two hundred
   * inherited rows above the six that are ours.
   */
  typescript: {
    reactDocgen: 'react-docgen-typescript',
    reactDocgenTypescriptOptions: {
      /**
       * **`tsconfig.app.json`, not `tsconfig.json`.** The root is a solution
       * file - `"files": []` and two references - so the plugin resolves an
       * empty project, reports every file as "not included in the active
       * TypeScript project", and silently emits no `__docgenInfo` at all. The
       * symptom is a docs page whose props table holds only what the story's
       * `args` put there.
       */
      tsconfigPath: './tsconfig.app.json',
      shouldExtractLiteralValuesFromEnum: true,
      shouldRemoveUndefinedFromOptional: true,
      propFilter: (prop) => !(prop.parent?.fileName ?? '').includes('node_modules'),
    },
  },
}

export default config
