/**
 * **The schema is the sanitiser, and this is the file that has to prove it.**
 *
 * `ReportPaper` puts `markdownToHtml`'s output through `dangerouslySetInnerHTML`,
 * so the safety of the whole paper column rests on one claim: a document whose
 * schema has no HTML node cannot carry markup out, and `Markdown` configured
 * `html: false` will not parse markup in. That is an argument, and an argument
 * is not a control - these are the measurements.
 *
 * **What would break it is adding an extension**, not editing this file - and
 * measured, it is not the `html` flag either. Flipping `Markdown` to
 * `html: true` leaves every assertion below green: the parser reads the tags
 * and the document still has no node that can hold one. What that flag
 * actually changes is *fidelity* - the pasted text stops coming back verbatim,
 * which is why one test here notices and the security ones do not.
 *
 * The payloads run against `proseExtensions()` itself rather than a list
 * assembled here, so a node that does accept raw markup fails these rather
 * than shipping.
 *
 * A report body is not hypothetical attacker input in the usual sense - it is
 * the analyst's own prose. It is also **pasted from the thing being
 * investigated**: a phishing mail, a ransom note, a web shell. Content out of an
 * incident is the last content to assume is inert.
 *
 * ## Asserted against the parsed DOM, not against the string
 *
 * Regexes fail on payloads that are already safe: the output is
 * `&lt;img src=x onerror="alert(1)"&gt;`, so `onerror=` is *text* and
 * `/\son\w+=/` matches it. A regex over serialised HTML cannot
 * tell an attribute from a character sequence - the browser can, and the
 * question is what the browser will do.
 */

import { describe, expect, it } from 'vitest'

import { markdownToHtml } from './prose-schema'

const PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src=x onerror="alert(1)">',
  '<iframe src="https://example.invalid"></iframe>',
  '<a href="javascript:alert(1)">click</a>',
  '<div onclick="alert(1)">text</div>',
  '<svg><script>alert(1)</script></svg>',
  '<style>body{display:none}</style>',
  // Markdown's own link syntax, which the schema *does* parse. The scheme is
  // the question here rather than the tag.
  '[click](javascript:alert(1))',
  // A ransom note is pasted verbatim into a report more often than not.
  'Your files are encrypted. <script>fetch("//x")</script> Contact us.',
]

/** What the browser would build out of it. */
function parse(html: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = html
  return host
}

describe('a body cannot carry markup into the paper', () => {
  it.each(PAYLOADS)('renders no live markup for %s', (payload) => {
    const host = parse(markdownToHtml(payload))

    expect(host.querySelectorAll('script, iframe, style, object, embed'))
      .toHaveLength(0)
    for (const element of host.querySelectorAll('*')) {
      for (const attribute of element.attributes) {
        expect(attribute.name.toLowerCase()).not.toMatch(/^on/)
        expect(attribute.value.toLowerCase()).not.toContain('javascript:')
      }
    }
  })

  it('keeps the words, so the analyst sees what was pasted', () => {
    // Stripping to nothing would be safe and useless: an analyst pasting a
    // ransom note needs to read the note. The tags go inert; the text stays.
    const host = parse(
      markdownToHtml('Your files are encrypted. <script>x</script> Pay.'))
    expect(host.textContent).toContain('Your files are encrypted.')
    expect(host.textContent).toContain('Pay.')
    expect(host.textContent).toContain('<script>')
  })

  it('still renders the marks the document is made of', () => {
    // Every guard above passes trivially against a function returning ''.
    const host = parse(markdownToHtml('## Head\n\nA **bold** word and `code`.'))
    expect(host.querySelector('h2')?.textContent).toBe('Head')
    expect(host.querySelector('strong')?.textContent).toBe('bold')
    expect(host.querySelector('code')?.textContent).toBe('code')
  })

  it('gives an ordinary link the attributes that make it safe to follow', () => {
    // Measured, not assumed: StarterKit's `Link` adds these, and a report is
    // read with attacker-chosen URLs in it more often than most documents.
    const link = parse(markdownToHtml('[ok](https://example.com)'))
      .querySelector('a')
    expect(link?.getAttribute('href')).toBe('https://example.com')
    expect(link?.getAttribute('rel')).toContain('noopener')
    expect(link?.getAttribute('rel')).toContain('noreferrer')
  })
})
