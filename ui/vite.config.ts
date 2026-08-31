/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'

import { existsSync } from 'node:fs'

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import { chromium } from 'playwright'
import { defineConfig, type ProxyOptions } from 'vite'

/**
 * Whether the story tier can run here, decided once and announced when it
 * cannot.
 *
 * `verify.sh` calls a bare `npx vitest run`, which runs every declared project
 * - so declaring the browser project unconditionally turns "this machine has
 * no Chromium" into a red suite rather than a missing tier. Announcing the
 * skip is the rule: a tier that is not running may not be counted as a pass,
 * and silence is what lets it be.
 *
 * `executablePath()` composes a path from the version Playwright expects and
 * does not check for it, so the `existsSync` is the whole test - a browsers
 * directory holding only last release's build answers a path that is not there.
 */
const STORY_TIER = ((): boolean => {
  try {
    return existsSync(chromium.executablePath())
  } catch {
    return false
  }
})()

if (!STORY_TIER) {
  console.warn(
    '[vitest] the story tier is skipped: no Chromium for Playwright. ' +
      'Run `npx playwright install chromium` in ui/ to include it.',
  )
}

/**
 * The dev loop talks plaintext to the server, and so does this proxy.
 *
 * **Three of the four things this used to carry are gone with app-side TLS.**
 * `https://` in the target, `secure: false` to accept an untrusted upstream
 * certificate, and the whole `tlsPair()` dance of serving the server's own pair
 * so a `__Secure-` cookie would ride the hop -- all of it existed because the
 * server terminated TLS. nginx does that in the container now and nothing
 * terminates it here, so `AUTH_BASE_URL` is http on the dev loop, Better Auth
 * omits the `__Secure-` prefix, and the cookie crosses plaintext quite happily.
 * `http://localhost` is a secure context in every browser, so nothing else
 * degrades.
 *
 * What survives, and still fails as something that reads like CORS:
 *
 * - `changeOrigin: true`, without which the proxy forwards Vite's own origin.
 * - the `Origin` header, rewritten by `sameOrigin` below. `changeOrigin`
 *   rewrites **`Host` only**, despite the name.
 *
 * The target is read from the environment because every port is derived per
 * worktree: `server/scripts/stack.mjs` allocates a slot and `dev-node.sh`
 * exports `INCIDENTCOMPANION_URL` from it, so two worktrees never proxy to
 * each other's server.
 */
const apiPort = process.env.INCIDENTCOMPANION_PORT ?? '8080'
const apiTarget = process.env.INCIDENTCOMPANION_URL ?? `http://127.0.0.1:${apiPort}`

/**
 * Make a proxied request look like it came from the app's own origin.
 *
 * A cookie-authenticated state change must carry this app's `Origin` exactly
 * (`auth.same_origin`, ASVS V13.2.3) - whole-string equality, so the browser's
 * `http://localhost:5173` is refused with a 403 that reads as a permissions
 * bug. `changeOrigin: true` does not fix it: it rewrites `Host` and nothing
 * else, which is the whole reason this hook exists and the reason every write
 * 403s under `vite dev` without it.
 *
 * **Dev-server only, and it is not a hole in the check.** Nothing here is
 * built or served; a production build is loaded from the app's own origin and
 * sends the right header itself. The proxy is the piece standing in for that.
 */
const proxied: ProxyOptions = {
  target: apiTarget,
  changeOrigin: true,
  /**
   * **Without this the case socket does not fail - it hangs.** `/api` carries
   * `ws://.../api/cases/:id/live`, and a proxy that has not opted into WebSockets
   * treats the `Upgrade` as an ordinary request: the connection is never
   * refused and never completes, so it holds a slot in the browser's per-host
   * pool. Firefox allows about six; once they are gone every later request
   * queues forever, including the app's own modules and its webfont.
   *
   * The symptom is not "the socket is broken". It is a page that renders
   * intermittently, a white screen on refresh, and requests stuck pending -
   * which reads as the whole dev server being unwell and clears only when the
   * browser's data is wiped. -> Vite's `server.proxy` docs, `ws`.
   */
  ws: true,
  configure: (proxy) => {
    proxy.on('proxyReq', (proxyReq) => {
      proxyReq.setHeader('origin', apiTarget)
    })
    // **`proxyReqWs` as well, and its absence broke the case socket.**
    // `proxyReq` fires for HTTP only, so an `Upgrade` arrived carrying the
    // browser's own origin while `changeOrigin` had already rewritten `Host`
    // to the target - and the server's same-origin check, which is what stops
    // cross-site WebSocket hijacking, refused every handshake with a 403.
    // Rewriting it here keeps dev looking like production rather than
    // loosening the check to accommodate the proxy.
    proxy.on('proxyReqWs', (proxyReq) => {
      proxyReq.setHeader('origin', apiTarget)
    })
  },
}

export default defineConfig({
  /**
   * The prefix, and it must equal `app/react_ui.py`'s `MOUNT_PREFIX` or every
   * asset is requested from a path the mount does not cover.
   * `tests/test_react_ui_serving.py` reads both and fails when they disagree.
   *
   * It applies to `vite dev` too, so both ways of running share one address
   * shape, and the router's basename comes off `import.meta.env.BASE_URL` so
   * nothing repeats it.
   */
  base: '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      /**
       * **The same mapping `tsconfig.app.json` declares**, so a test may import
       * a server *value* - a vocabulary, a schema - and not only a type.
       * Product code imports `@contract/*` with `import type` alone, which is
       * erased before the bundler runs, so this alias adds nothing to the
       * bundle; without it the tests cannot resolve the path at all.
       */
      '@contract': fileURLToPath(new URL('../server/src/domain', import.meta.url)),
    },
  },
  /**
   * **`process.env.NODE_ENV`, for a dependency that reads it in the browser.**
   *
   * `react-stately`'s virtualiser -- reached through the kit's `VirtualTable`
   * -- checks `process.env.NODE_ENV` at render, and nothing defines `process`
   * in a browser bundle. The story threw `process is not defined` on its
   * first paint rather than at build time.
   */
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'development'),
  },

  server: {
    /**
     * **Plaintext, and the cookie rule that forced https here is what permits
     * it.** Better Auth names the cookie `__Secure-` from its *base URL*, and
     * a `__Secure-` cookie rides TLS only -- so a plaintext hop in front of an
     * https server authenticated once and 401'd on everything after. That was
     * the defect; serving TLS here was the workaround. With `AUTH_BASE_URL`
     * http on the dev loop there is no prefix to carry, and the whole hop is
     * plaintext end to end. The container is unaffected: nginx is https there,
     * the prefix is correct, and the browser -- the only thing that enforces
     * it -- never sees the plaintext leg.
     */
    proxy: {
      '/api': proxied,
      // `auth.ACTIVITY_PATH`, which is not under `/api` and so would otherwise
      // be served by Vite as the SPA index - a 200 that advances no clock and
      // signs the analyst out after the idle window with nothing to show why.
      '/activity': proxied,
      // `index.html`'s `<link>` is root-scoped to match `app/main.py`'s
      // `/favicon.svg`, which `ui/public/` does not carry - unproxied, Vite
      // answers the SPA index for it under history-fallback and the tab shows
      // a broken-image glyph, not the browser's own default icon.
      '/favicon.svg': proxied,
      '/favicon.ico': proxied,
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    /**
     * **A zone that is not the storage zone, on purpose.**
     *
     * Everything this app stores is UTC, and the container runs at UTC too -
     * so every confusion between a local `Date` and a stored ISO string is
     * invisible to this suite. Measured 2026-08-20 on `datetime-input.tsx`:
     * building the calendar's `Date` with `new Date('2026-08-20')` instead of
     * from the date's parts shifts the day for anyone west of Greenwich, and
     * that mutation passes all 17 of its own tests at UTC and fails two of
     * them here. A test that cannot fail at the harness's timezone is not
     * testing the timezone.
     *
     * **New York rather than a random offset**: negative, on the half of the
     * globe where a UTC-midnight `Date` lands on the previous day, and with a
     * daylight-saving rule, so a fixture in July and one in January differ.
     * The whole suite was green here before this was pinned - 188 files, 1799
     * tests - so nothing is being papered over.
     */
    env: { TZ: 'America/New_York' },
    // **Asked of the runtime, not of this process.** `'localStorage' in
    // globalThis` answers "does *this* process have webstorage", and this
    // config runs in the parent while the flag is for the workers - so passing
    // `--no-webstorage` to the parent made the condition false, no flag reached
    // the children, and the flag disabled itself. Measured: `node
    // --no-webstorage node_modules/vitest/vitest.mjs run` failed the very
    // suite it was asking to fix. `allowedNodeEnvironmentFlags` answers "does
    // this runtime know the flag", which is what the line wants and is true on
    // 26 with or without it, false on 24.
    execArgv: process.allowedNodeEnvironmentFlags.has('--webstorage')
      ? ['--no-webstorage']
      : [],
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // `include` lives on the `unit` project below, not here. Once `projects`
    // is declared the root config stops being a project of its own, so an
    // `include` at this level selects nothing and the tier runs zero files.
    // **20s, because the 5s default is a measurement of a MacBook's SSD.**
    // Inside the dev container `ui/src` is a bind mount, and the three
    // structural tests that walk it take 869ms alone and 6.1-8.9s under a full
    // parallel run -- so the tier failed two runs in three, naming tests that
    // say nothing about the filesystem. A structural assertion is not timing
    // anything, so a tight budget here can only report the machine.
    // Pinned by tests/test_platform_portability.py.
    testTimeout: 20000,
    // **Node's own Web Storage must be off, or jsdom's never installs.**
    // Node 25 and later define `localStorage` as a global, and Vitest only
    // populates jsdom globals that are not already present -- so the name
    // being *taken* is enough: every read falls through to Node's getter and
    // `window.localStorage` is undefined. jsdom is not at fault; it hands back
    // a working `localStorage` when constructed directly on either runtime.
    // -> vitest-dev/vitest#8757
    //
    // **The flag belongs on `test.execArgv`, not on the `test` script.**
    // `poolOptions.<pool>.execArgv` is absent from vitest 4; it was flattened
    // to `test.execArgv`. On the script instead, every other route drops it --
    // `npx vitest`, `verify.sh`, `test:watch`, an IDE runner. The conditional
    // survives being here: a `.ts` config evaluates it, and on a Node without
    // the global no flag is passed.
    /**
     * Two projects over one runner, and the second is what the stories are for.
     *
     * **`storybook` is not a second test tool.** `storybookTest` is a *Vitest*
     * plugin: it transforms each `.stories.tsx` into a Vitest test through
     * portable stories, smoke-testing the render and running the `play`
     * function where one is defined. What it adds is the browser, not a runner.
     *
     * **Which is the whole reason it earns a place.** Every other tier here is
     * jsdom, where an element's box is `0px` and axe has nothing to measure -
     * so a per-component layout or contrast defect is invisible to
     * `src/**\/*.test.tsx` by construction, and `server/e2e/` can only reach a
     * component through the screen that mounts it. This tier sees a component
     * on its own, laid out.
     *
     * **It skips in silence without the Chromium binary**, exactly as the
     * browser tier does, so it is a local gate rather than a guarantee.
     * `npx playwright install chromium` is what it wants.
     */
    /**
     * **Two workers, not one per core.** A jsdom worker is a React
     * environment, and Vitest's default is the core count -- a throughput
     * default that assumes memory to spend. Two rather than one because the
     * client tier is fast, and one worker makes a full run tedious enough
     * that people skip it. `server` sets `fileParallelism: false` for the
     * same reason.
     */
    maxWorkers: 2,

    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
      ...(STORY_TIER ? [{
        extends: true as const,
        plugins: [
          storybookTest({
            configDir: fileURLToPath(new URL('./.storybook', import.meta.url)),
            storybookScript: 'npm run storybook',
          }),
        ],
        test: {
          name: 'storybook',
          // Replaces the jsdom setup rather than adding to it: `setupFiles` is
          // an array the project overrides whole, and `src/test/setup.ts`
          // installs jsdom shims for globals a real browser already has.
          setupFiles: ['./.storybook/vitest.setup.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' as const }],
          },
        },
      }] : []),
    ],
  },
})
