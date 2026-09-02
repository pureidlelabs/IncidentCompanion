/**
 * The strip that says what this is, where the visitor's work goes, which build
 * it is, and how to start again.
 *
 * Plain DOM rather than a component: it belongs to the evaluation build and not
 * to the application, so it renders outside the React tree and no screen has to
 * know whether it is there.
 *
 * **The build stamp is what makes a stale demo legible.** Publication is not a
 * required check anywhere, so a demo can quietly stop being republished; from
 * inside the page there is otherwise nothing that says which tree it is.
 *
 * **The source offer is the licence's**, not decoration. Publishing this over a
 * network is conveying it under AGPL section 13, which obliges an offer of the
 * corresponding source to the people using it.
 *
 * **The sentence about where the work goes is the load-bearing one.** This is
 * a branded product opening on a case, so an analyst will type a real hostname
 * into it. Nothing else on screen says the case never leaves the browser, and
 * that is the sentence that lets them answer their employer.
 */
const SOURCE = 'https://github.com/pureidlelabs/IncidentCompanion'

const STYLE = `
  position: fixed; inset-block-end: 0; inset-inline-end: 0; z-index: 2147483647;
  display: flex; gap: 0.75rem; align-items: center;
  padding: 0.3rem 0.6rem; border-start-start-radius: 0.4rem;
  font: 11px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: canvastext; background: canvas; opacity: 0.82;
  border-block-start: 1px solid; border-inline-start: 1px solid; border-color: color-mix(in srgb, canvastext 20%, transparent);
`

function link(text: string, href: string): HTMLAnchorElement {
  const anchor = document.createElement('a')
  anchor.textContent = text
  anchor.href = href
  anchor.rel = 'noreferrer'
  anchor.style.color = 'inherit'
  return anchor
}

/** Draw it. `build` is whatever identifies the tree this was built from. */
export function showBadge(build: string, onReset: () => void): void {
  const strip = document.createElement('div')
  strip.setAttribute('style', STYLE)

  const what = document.createElement('span')
  // The separator is rendered, so it is spelled as an escape.
  what.textContent = `demo \u00B7 ${build}`

  const where = document.createElement('span')
  where.textContent = 'Everything you type stays in this browser. Clearing site data removes it.'

  strip.append(what, where, link('source', SOURCE))

  const again = document.createElement('button')
  again.type = 'button'
  again.textContent = 'reset'
  again.setAttribute(
    'style',
    'font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; text-decoration: underline',
  )
  again.addEventListener('click', () => {
    // Asked, because it throws away whatever the visitor has written and the
    // strip sits under the cursor's resting corner.
    if (window.confirm('Start again from the case as published? Your changes are discarded.')) onReset()
  })
  strip.append(again)

  document.body.append(strip)
}
