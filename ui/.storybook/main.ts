import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'

import type { StorybookConfig } from '@storybook/react-vite'
import { mergeConfig, searchForWorkspaceRoot, type Plugin } from 'vite'

/**
 * Lets the browser keep a font file across story navigations.
 *
 * The dev server sends no validator for one, so a walk that navigates per
 * story refetches it every time -- and the file is content-addressed by its
 * own name, so it can be held for as long as the browser likes. -> #1069
 *
 * Registered before Vite's own middlewares, which is where a header has to be
 * set to reach the static response.
 */
function cacheTheFont(): Plugin {
  return {
    name: 'incidentcompanion:cache-the-font',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (/\.(?:woff2?|ttf|otf)(?:\?|$)/.test(request.url ?? '')) {
          response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        }
        next()
      })
    },
  }
}

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)', '../src/**/*.mdx'],
  addons: ['@storybook/addon-a11y', '@storybook/addon-mcp', '@storybook/addon-docs'],
  framework: { name: '@storybook/react-vite', options: {} },
  // A static build you open from disk, with no server behind it. Every
  // story renders from `src/fixtures/`; a story needing the API is a story
  // that cannot be opened in the morning.
  staticDirs: [],
  /**
   * Serves the product's own font when `node_modules` is a symlink.
   *
   * Vite resolves the asset to its real path, which in a worktree is outside
   * the tree and refused by `server.fs` -- so the gallery renders in a
   * fallback face and every text measurement the visual tier takes is of a
   * font nobody ships. Naming `allow` turns the automatic workspace lookup
   * off, so `searchForWorkspaceRoot` puts it back.
   */
  viteFinal: (config) =>
    mergeConfig(config, {
      server: {
        fs: {
          allow: [
            searchForWorkspaceRoot(process.cwd()),
            realpathSync(resolve(process.cwd(), '..', 'node_modules')),
          ],
        },
      },
      plugins: [cacheTheFont()],
    }),
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
