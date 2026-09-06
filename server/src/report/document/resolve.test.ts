/**
 * Resolving a report, and painting it as markdown.
 *
 * **The failure worth the most here is a section that resolves to nothing.** A
 * customer report missing its timeline, with no sign anything went wrong, is
 * indistinguishable to the reader from a case that had no timeline - and to the
 * analyst who sent it. The refusal is what makes that impossible, so it is the
 * first thing asserted.
 */
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'

import { toMarkdown } from './markdown.js'
import { RESOLVERS, UnresolvableSections, resolveReport, type ReportInput } from './resolve.js'
import type { Node } from './model.js'
import { english, packFrom, translatorFor } from './packs.js'
import { BLOCK_KINDS } from '../../domain/entities/report.js'

function block(over: Partial<ReportInput['blocks'][number]> = {}) {
  return { id: 'b1', kind: 'written', heading: '', headingKey: '', position: 0, ...over }
}

function input(over: Partial<ReportInput> = {}): ReportInput {
  return { title: 'CASE-1', tlp: '', language: 'en', t: english(), languageCoverage: 1, blocks: [block()], ...over }
}

describe('resolving a report', () => {
  /**
   * **The document records how much of its language this build carried.**
   * Computed here rather than by whoever draws it, so a report frozen on
   * sending keeps what was true that day - the packs grow, and a filing
   * re-opened next year should not silently claim today's coverage.
   *
   * **What is true of a given language is a property of a row**, which
   * `packs.test.ts` holds. This function's job is that the figure it was built
   * with reaches the document unchanged, because that is what a frozen report
   * keeps.
   */
  it('records on the document the coverage it was built with', () => {
    expect(resolveReport(input({ blocks: [] })).languageCoverage).toBe(1)
    const partial = resolveReport({
      ...input({ blocks: [] }),
      language: 'nl',
      languageCoverage: 0.65,
    })
    expect(partial.languageCoverage).toBe(0.65)
  })

  /**
   * **The cover carries what a reader needs before the first section**, and
   * the two values that are *judgements* rather than facts - the severity and
   * the marking - are chips, so a reader takes them at a glance and a painter
   * cannot decide to print one flat.
   */
  it('opens on a cover naming the customer, the case and the analyst', () => {
    const document_ = resolveReport(
      input({
        blocks: [],
        tlp: 'TLP:AMBER',
        caseData: {
          id: 'c1',
          title: 'CASE-1',
          customer: 'Acme Corp',
          reference: 'CASE-2026-001',
          analyst: 'An Analyst',
          status: 'open',
          severity: 'high',
          // **`summary`, which is the column the cases table has.** This
          // fixture said `description`, a field no row carries, and the cover
          // read it through a cast - so the headline fell to the customer name
          // in production while this assertion passed on a value nothing
          // serves, and page one printed "Acme Corp" over "Acme Corp - CASE-1".
          summary: 'Phishing to lateral movement on one finance workstation.',
        },
      }),
    )
    const cover = document_.cover
    expect(cover).toBeDefined()
    // The headline is what happened, not the case number - that is the
    // subtitle's job and the reader has it three lines down.
    expect(cover!.title).toContain('Phishing to lateral movement')
    expect(cover!.subtitle).toContain('Acme Corp')
    expect(cover!.subtitle).toContain('An Analyst')

    const labels = cover!.rows.map((row) => row.label)
    expect(labels).toContain('Customer')
    expect(labels).toContain('Analyst')

    const severity = cover!.rows.find((row) => row.label === 'Severity')
    expect(severity?.value.chip).toEqual({ kind: 'severity', value: 'high' })
    const marking = cover!.rows.find((row) => row.label === 'Classification')
    expect(marking?.value.tlp).toBe(true)
  })

  /**
   * **A row nobody filled in is left off rather than printed empty.** A cover
   * is the page a customer reads first, and a column of blank values reads as
   * a document that failed to render - the opposite failure to the case header
   * inside, where an absent customer must be visible as a gap.
   */
  it('leaves an unstated fact off the cover rather than printing it blank', () => {
    const document_ = resolveReport(
      input({ blocks: [], tlp: '', caseData: { id: 'c1', title: 'CASE-1', customer: 'Acme' } }),
    )
    const labels = document_.cover!.rows.map((row) => row.label)
    expect(labels).toContain('Customer')
    expect(labels).not.toContain('Analyst')
    expect(labels).not.toContain('Classification')
  })

  /** A report with no case behind it still paints; the cover is what it lacks. */
  it('has no cover when there is no case to build one from', () => {
    expect(resolveReport(input({ blocks: [] })).cover).toBeUndefined()
  })

  it('refuses a document it cannot render in full, naming every kind', () => {
    // Named, not the first one: an analyst who fixes one and is then told about
    // the next has been sent round the loop for no reason.
    /**
     * **Kinds this build genuinely cannot produce**, which is now only the
     * outliving case: a report authored by a newer build and opened by an
     * older one. This used `figure` as the other, on the grounds that it was
     * the last unbuilt resolver - it is built now, so that half would have
     * asserted nothing while still reading as two cases. Two are needed
     * because the property is that *every* kind is named rather than the
     * first, so the second is another unknown rather than a real kind.
     */
    const blocks = [
      block({ id: 'a', kind: 'from-a-later-build', position: 0 }),
      block({ id: 'b', kind: 'from-an-even-later-build', position: 1 }),
      block({ id: 'c', kind: 'from-a-later-build', position: 2 }),
    ]
    try {
      resolveReport(input({ blocks }))
      expect.unreachable('an unrenderable report was resolved')
    } catch (error) {
      expect(error).toBeInstanceOf(UnresolvableSections)
      expect((error as UnresolvableSections).kinds).toEqual([
        'from-a-later-build',
        'from-an-even-later-build',
      ])
    }
  })

  it('resolves a generated kind once this build has a resolver for it', () => {
    // Registered here rather than shipped, so the refusal above stays honest
    // about what the build can actually do.
    const nodes: Node[] = [{ type: 'richPara', runs: [{ text: 'resolved' }] }]
    RESOLVERS['probe_kind'] = () => nodes
    try {
      const document_ = resolveReport(input({ blocks: [block({ kind: 'probe_kind' })] }))
      expect(document_.sections[0]!.nodes).toEqual(nodes)
    } finally {
      delete RESOLVERS['probe_kind']
    }
  })

  it('takes the sections in position order, not the order they were read', () => {
    // A report is a document; its sections arriving in insertion order is not a
    // sorting preference but the wrong document.
    const blocks = [
      block({ id: 'c', position: 2 }),
      block({ id: 'a', position: 0 }),
      block({ id: 'b', position: 1 }),
    ]
    const document_ = resolveReport(input({ blocks }))
    expect(document_.sections.map((one) => one.blockId)).toEqual(['a', 'b', 'c'])
  })

  it('reads each written section from its own fragment', () => {
    // One document, a fragment per block. Reading the wrong one puts another
    // section's words under this heading.
    const doc = new Y.Doc({ gc: false })
    for (const [id, line] of [
      ['a', 'the summary'],
      ['b', 'the root cause'],
    ]) {
      const fragment = doc.getXmlFragment(id)
      const para = new Y.XmlElement('paragraph')
      const text = new Y.XmlText()
      text.insert(0, line!)
      para.insert(0, [text])
      fragment.insert(0, [para])
    }

    const document_ = resolveReport(
      input({
        prose: doc,
        blocks: [
          block({ id: 'a', heading: 'Summary', position: 0 }),
          block({ id: 'b', heading: 'Root cause', position: 1 }),
        ],
      }),
    )
    expect(toMarkdown(document_)).toContain('## Summary')
    expect(toMarkdown(document_)).toMatch(/## Summary\n+the summary/)
    expect(toMarkdown(document_)).toMatch(/## Root cause\n+the root cause/)
  })

  it('treats a report nobody has typed into as empty rather than broken', () => {
    const document_ = resolveReport(input({ blocks: [block({ heading: 'Summary' })] }))
    expect(document_.sections[0]!.nodes).toEqual([])
    expect(toMarkdown(document_)).toContain('## Summary')
  })
})

describe('painting markdown', () => {
  const paint = (nodes: Node[]) =>
    toMarkdown({
      title: 'CASE-1',
      tlp: '',
      language: 'en',
      languageCoverage: 1,
      sections: [{ blockId: 'b', kind: 'written', heading: '', nodes }],
    })

  it('escapes what an analyst typed rather than letting it become markup', () => {
    // An asterisk inside a sentence is a literal; emitted raw it turns the rest
    // of the paragraph italic in every reader.
    expect(paint([{ type: 'richPara', runs: [{ text: 'the *.exe was dropped' }] }])).toContain(
      '\\*.exe',
    )
  })

  it('does not escape a full stop into every sentence', () => {
    // `.` only starts a list after a digit at the start of a line. Escaping it
    // everywhere puts a backslash at the end of every sentence in the report.
    const painted = paint([{ type: 'richPara', runs: [{ text: 'It was contained.' }] }])
    expect(painted).toContain('It was contained.')
    expect(painted).not.toContain('contained\\.')
  })

  it('escapes a pipe inside a cell instead of dropping it', () => {
    // A command line holding a pipe is ordinary evidence: dropping it changes
    // what the reader is told the attacker ran, and leaving it splits the row
    // into extra columns.
    const painted = paint([
      {
        type: 'table',
        header: ['Command'],
        rows: [[{ text: 'whoami | findstr admin' }]],
        widths: [1],
      },
    ])
    expect(painted).toContain('whoami \\| findstr admin')
    expect(painted.split('\n').filter((line) => line.startsWith('|'))).toHaveLength(3)
  })

  it('leaves an empty cell empty, whatever its semantic', () => {
    // A mono cell with no value rendered as a bare pair of backticks - on every
    // timeline row with no technique, where it reads as a value that failed to
    // print. Found by painting a real case and looking at it.
    const painted = paint([
      {
        type: 'table',
        header: ['Technique'],
        rows: [[{ text: '', mono: true }]],
        widths: [1],
      },
    ])
    expect(painted).not.toContain('``')
  })

  it('numbers an ordered list itself, whatever the source said', () => {
    const painted = paint([
      {
        type: 'list',
        items: [
          { runs: [{ text: 'first' }], level: 0, ordered: true },
          { runs: [{ text: 'second' }], level: 0, ordered: true },
        ],
      },
    ])
    expect(painted).toContain('1. first')
    expect(painted).toContain('2. second')
  })

  it('restarts a level counter when the list leaves that level', () => {
    // Otherwise the second group under step 2 continues numbering from the
    // first group's last item, which reads as one sequence of six.
    const painted = paint([
      {
        type: 'list',
        items: [
          { runs: [{ text: 'one' }], level: 0, ordered: true },
          { runs: [{ text: 'one-a' }], level: 1, ordered: true },
          { runs: [{ text: 'two' }], level: 0, ordered: true },
          { runs: [{ text: 'two-a' }], level: 1, ordered: true },
        ],
      },
    ])
    expect(painted).toContain('  1. one-a')
    expect(painted).toContain('  1. two-a')
  })

  it('renders a link so the address is visible', () => {
    // A link whose text hides its destination is worse than plain text in a
    // document a customer forwards on.
    expect(
      paint([{ type: 'richPara', runs: [{ text: 'the advisory', url: 'https://example.test/a' }] }]),
    ).toContain('the advisory (https://example.test/a)')
  })

  it('gives a headerless table a header row, because markdown has no other kind', () => {
    // Without the separator the whole block renders as one paragraph of pipes.
    const painted = paint([
      { type: 'table', rows: [[{ text: 'Customer' }, { text: 'Acme' }]], widths: [1, 1] },
    ])
    expect(painted).toContain('| --- | --- |')
  })

  it('leaves no gap where a section resolved to nothing', () => {
    // A run of blank lines reads as a missing paragraph to anyone who did not
    // write the report.
    const painted = toMarkdown({
      title: 'CASE-1',
      tlp: 'TLP:AMBER',
      language: 'en',
      languageCoverage: 1,
      sections: [
        { blockId: 'a', kind: 'written', heading: 'Summary', nodes: [] },
        {
          blockId: 'b',
          kind: 'written',
          heading: 'Root cause',
          nodes: [{ type: 'richPara', runs: [{ text: 'phishing' }] }],
        },
      ],
    })
    expect(painted).not.toMatch(/\n\n\n/)
    expect(painted).toContain('**TLP:AMBER**')
  })
})

describe('the heading a keyed section prints', () => {
  /**
   * **Measured against the running server: the exported document printed
   * `## heading.exec_summary` as a section title.** The key was passed through
   * as the heading, which was correct while no pack existed and became a raw
   * identifier in a customer-facing file the day one did. The screen resolved
   * it and the export did not, so the two disagreed about the same section.
   */
  it('resolves through the pack this document was built with', () => {
    const document_ = resolveReport(
      input({
        language: 'nl',
        t: translatorFor(packFrom({
          code: 'nl',
          label: 'Nederlands',
          strings: { 'heading.root_cause': 'Grondoorzaak' },
        })),
        blocks: [block({ headingKey: 'heading.root_cause' })],
      }),
    )
    expect(document_.sections[0]?.heading).toBe('Grondoorzaak')
  })

  /**
   * **A generated section titles itself from its kind, through the pack.**
   *
   * Measured 2026-08-13 against a rendered demo report: a nine-section
   * document carried four headings. A layout gives a generated entry neither
   * a heading nor a key, so this answered `''` and the timeline table printed
   * straight under the executive summary with nothing above it - while the
   * screen showed an English name from a client-side fallback that never
   * reaches the document.
   *
   * Derived from the kind rather than stamped on the row at insert: a literal
   * in the row is unreachable by any pack, which is what made the English
   * title permanent in a Dutch report.
   */
  it('titles a generated section from its kind when the row names nothing', () => {
    const document_ = resolveReport(
      input({
        language: 'nl',
        t: translatorFor(packFrom({
          code: 'nl',
          label: 'Nederlands',
          strings: { 'heading.timeline': 'Tijdlijn van gebeurtenissen' },
        })),
        blocks: [block({ kind: 'timeline' })],
      }),
    )
    expect(document_.sections[0]?.heading).toBe('Tijdlijn van gebeurtenissen')
  })

  /**
   * **The written block is the exception, and stays untitled.** Its heading is
   * the analyst's words; deriving one would print "Written section" above
   * every paragraph they wrote.
   */
  it('leaves a written section with no heading of its own', () => {
    const document_ = resolveReport(input({ blocks: [block({ kind: 'written' })] }))
    expect(document_.sections[0]?.heading).toBe('')
  })

  /**
   * The analyst's own title is not a key and is never looked up - a heading
   * that happened to match a key would otherwise be rewritten under them.
   */
  it('leaves a heading the analyst typed exactly as typed', () => {
    const document_ = resolveReport(
      input({ blocks: [block({ heading: 'heading.root_cause', headingKey: 'heading.narrative' })] }),
    )
    expect(document_.sections[0]?.heading).toBe('heading.root_cause')
  })
})

describe('every kind the application titles for itself', () => {
  /**
   * **The quantified form of the two cases above.** They show one key
   * translated and one analyst heading left alone; `report` asks for more than
   * an example -- *everything the application supplies MUST be in the language
   * the report is produced in*, and *it MUST be complete: a heading left in
   * another language is the application failing at its own job*.
   *
   * So the subject list is `BLOCK_KINDS` rather than a kind somebody picked,
   * and a kind added later is swept without this file being edited. The
   * failure it catches is a new section that titles itself from a literal
   * instead of through the pack: correct in English, and untranslated in
   * every other language.
   *
   * `written` is the documented exception -- its words are the analyst's, and
   * a derived title would head every one of them "Written section" -- so it
   * is asserted to have no heading rather than excluded by name.
   */
  const marking = (key: string): string => `[[${key}]]`

  it.each(BLOCK_KINDS.filter((kind) => kind !== 'written'))(
    '%s titles itself through the pack',
    (kind) => {
      const document_ = resolveReport(
        input({ t: marking, blocks: [block({ kind, heading: '', headingKey: '' })] }),
      )

      expect(
        document_.sections[0]?.heading,
        `a ${kind} section titles itself without asking the pack, so it stays in the ` +
          'language it was written in whatever language the report is produced in',
      ).toMatch(/^\[\[.+\]\]$/)
    },
  )

  it('leaves the written block untitled rather than deriving one', () => {
    const document_ = resolveReport(
      input({ t: marking, blocks: [block({ kind: 'written', heading: '', headingKey: '' })] }),
    )

    expect(
      document_.sections[0]?.heading,
      'a written section was given a derived title, which heads every one of them the same',
    ).toBe('')
  })
})
