/**
 * **The schema is the sanitiser, and this is the file that has to prove it.**
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
