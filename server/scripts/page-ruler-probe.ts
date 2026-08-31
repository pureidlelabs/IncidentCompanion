/**
 * What `pageBreakBefore` actually reports, measured rather than assumed.
 *
 * The ruler stands on pdfmake calling this callback for every identified node
 * with a usable `pageNumbers` and `pages`. That is what the types promise; this
 * prints what a real multi-page render answers, which is the only thing that
 * settles it.
 *
 * Outside `src/` because it is an instrument, not a unit - run it with
 * `npx tsx scripts/page-ruler-probe.ts`.
 */
import { pageRuler, toPdf } from '../src/report/document/pdf.js'
import type { Document, Section } from '../src/report/document/model.js'

/** A section long enough that several of them cross a page boundary. */
function fat(heading: string, paragraphs: number): Section {
  return {
    blockId: heading,
    kind: 'written',
    heading,
    nodes: [
      {
        type: 'prose',
        paras: Array.from(
          { length: paragraphs },
          (_, at) =>
            `${heading} paragraph ${String(at)}. ` +
            'The quick brown fox jumps over the lazy dog, repeatedly and at '.repeat(4),
        ),
      },
    ],
  }
}

const document_: Document = {
  title: 'Page ruler probe',
  tlp: 'TLP:AMBER',
  language: 'en',
  languageCoverage: 1,
  sections: [fat('Alpha', 12), fat('Bravo', 12), fat('Charlie', 12), fat('Delta', 12)],
}

// Wrapped rather than top-level: `tsx` compiles this to CommonJS, where a
// top-level await is a build error rather than a runtime one.
async function main(): Promise<void> {
  const ruler = await pageRuler(document_)
  console.log('pages:', ruler.pages)
  for (const one of ruler.sections) {
    console.log(`  ${String(one.index)}  page ${String(one.page)}  ${one.heading}`)
  }

  // The ruler must describe the file that is actually delivered, so render the
  // same document and report its size beside the count.
  const file = await toPdf(document_)
  console.log('pdf bytes:', file.length)
}

void main()
