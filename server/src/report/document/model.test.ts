/**
 * The frozen document's schema is what a sent report is read back through.
 *
 * **Written from the drift, not the happy path.** A sent report is painted from
 * its `jsonb` frozen tree for ever and never re-resolved, so the tree that lost
 * or drifted a field is the failure the cast this replaced could not see - it
 * painted a wrong document to a regulator in silence. These assert the parse
 * refuses one, so the export fails loudly instead. -> `render.service.ts`
 */
import { describe, expect, it } from 'vitest'

import { documentSchema } from './model.js'

const valid = {
  title: 'INC-2026-0042',
  tlp: 'TLP:AMBER',
  language: 'en',
  languageCoverage: 1,
  sections: [
    {
      blockId: 'b1',
      kind: 'written',
      heading: 'Root cause',
      nodes: [{ type: 'richPara', runs: [{ text: 'A phishing email.' }] }],
    },
  ],
}

describe('the frozen document schema', () => {
  it('accepts a well-formed tree', () => {
    expect(() => documentSchema.parse(valid)).not.toThrow()
  })

  it('refuses a tree missing a top-level field the painters read', () => {
    const { sections: _dropped, ...noSections } = valid
    expect(() => documentSchema.parse(noSections)).toThrow()
  })

  it('refuses a node whose type no painter draws', () => {
    const drifted = {
      ...valid,
      sections: [{ ...valid.sections[0], nodes: [{ type: 'callout', runs: [] }] }],
    }
    expect(() => documentSchema.parse(drifted)).toThrow()
  })

  it('refuses a table row whose cell lost its text', () => {
    const drifted = {
      ...valid,
      sections: [
        {
          ...valid.sections[0],
          nodes: [{ type: 'table', rows: [[{ align: 'left' }]], widths: [1] }],
        },
      ],
    }
    expect(() => documentSchema.parse(drifted)).toThrow()
  })

  it('refuses languageCoverage that is not a number', () => {
    expect(() => documentSchema.parse({ ...valid, languageCoverage: 'most' })).toThrow()
  })

  it('carries a fully-populated document through unchanged, stripping no used field', () => {
    // Zod objects strip unknown keys, so this is the guard the reject tests are
    // not: a field the painters read but the schema forgot would be dropped on
    // freeze in silence. Every optional and every node kind a resolver can
    // produce is present, and parse must return it deep-equal.
    const full = {
      title: 'CASE-1',
      tlp: 'TLP:AMBER',
      language: 'nl',
      languageCoverage: 0.8,
      cover: {
        eyebrow: 'INCIDENT REPORT',
        title: 'Phishing to lateral movement',
        subtitle: 'Acme - CASE-1 - Analyst',
        rows: [{ label: 'Severity', value: { text: 'high', chip: { kind: 'severity', value: 'high' }, tlp: true } }],
      },
      sections: [
        {
          blockId: 'b1',
          kind: 'written',
          heading: 'Findings',
          nodes: [
            { type: 'richPara', runs: [{ text: 'bold', bold: true }, { text: ' link', url: 'https://x.test' }] },
            { type: 'subhead', text: 'Detail' },
            { type: 'minorHead', text: 'More' },
            { type: 'list', items: [{ runs: [{ text: 'step' }], level: 0, ordered: true }] },
            { type: 'code', lines: ['whoami'], language: 'text' },
            { type: 'quote', runs: [{ text: 'pay up', italic: true }] },
            { type: 'divider' },
            {
              type: 'table',
              header: ['A', 'B'],
              rows: [[{ text: 'merged', colSpan: 2, align: 'center', fill: '#eee' }, { text: '' }]],
              widths: [0.5, 0.5],
              zebra: false,
            },
            { type: 'spine', phases: [{ label: 'Recon', fill: '#123456' }], foot: '1 of 7' },
            { type: 'figure', caption: 'evidence.png', hash: 'abc123', widthPt: 100, heightPt: 80, note: 'unavailable' },
          ],
        },
      ],
    }
    expect(documentSchema.parse(full)).toEqual(full)
  })
})
