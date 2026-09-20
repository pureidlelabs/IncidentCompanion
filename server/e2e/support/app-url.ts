import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const STACK = (): { apiUrl: string; vitePort: number } =>
  JSON.parse(
    execFileSync('node', [join(__dirname, '../../scripts/stack.mjs'), '--json'], {
      encoding: 'utf8',
    }),
  ) as { apiUrl: string; vitePort: number }

/**
 * Where the browser is pointed. **The dev server by default; `dist` on
 * request.**
 *
 * **Vite is the default because it cannot go stale.** A `dist` that was never
 * rebuilt reads as a fix that did not apply, and nothing in the capture says
 * which of the two it was.
 *
 * **`VISUAL_TARGET=dist` is what a landing runs**, and the reason is Tailwind
 * rather than tidiness: the build emits only the classes it finds, so a class
 * assembled at runtime can draw in dev and be absent from the bundle. That
 * defect is invisible here and `npm run visual:dist` is where it surfaces.
 * -> `server/e2e/support/app.ts`
 *
 * **Its own module so the prerequisite check can ask the same question the
 * config answers.** Reading it off a project instead makes the answer depend
 * on which project happens to be first. -> #995
 *
 * `__dirname` rather than `import.meta`: Playwright loads these through a
 * CommonJS wrapper whatever the extension says.
 */
export const APP_URL: string =
  process.env.INCIDENTCOMPANION_E2E_URL ??
  (process.env.VISUAL_TARGET === 'dist'
    ? STACK().apiUrl
    : `http://127.0.0.1:${String(STACK().vitePort)}`)

/** Where the built client is served: Nest serves `ui/dist` on the API port. */
export const DIST_URL: string = STACK().apiUrl
