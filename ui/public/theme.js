/**
 * The ground, on the root element, before the stylesheet paints anything.
 *
 * **A served file, not an inline script, because this app sends
 * `script-src 'self'`.** An inline `<script>` is blocked whatever it says -
 * there was one here and the console reported the violation on every load
 * while it silently did nothing. `/api/docs/boot.js` is the same answer to
 * the same problem, one directory over.
 *
 * **`next-themes` cannot do this job in a client-rendered app, and that is
 * structural rather than a gap in it.** Its `ThemeScript` is a `<script>`
 * element rendered by React, so it is hoisted and run when the bundle
 * executes - long after first paint - and its `nonce` is applied only when
 * `typeof window === 'undefined'`, which never holds here. The library still
 * owns the state, the `system` listener and the persistence; this only reads
 * the key it writes.
 *
 * Measured with the OS on light and the stored ground dark: without this, the
 * first two animation frames paint `--background`'s light value and flip a
 * frame later. `server/e2e/first-paint.spec.ts` holds it.
 *
 * `ic-theme` is `ThemeProvider`'s `storageKey` in `main.tsx`: change one,
 * check the other. There is no third copy.
 */
;(function () {
  try {
    var stored = window.localStorage.getItem('ic-theme')
    var dark =
      stored === 'dark' ||
      (stored !== 'light' &&
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  } catch {
    // A blocked store is not a reason to have no ground at all.
    document.documentElement.dataset.theme = 'light'
  }
})()
