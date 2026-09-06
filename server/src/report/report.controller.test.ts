/**
 * What the New report form is offered.
 *
 * **The defect this is named for is a dialog that cannot be submitted.** The
 * form picks `layouts[0]` when the analyst has chosen nothing and disables
 * Create while that is undefined, so an empty list is a dialog that opens,
 * accepts a name, and refuses to close - with no failed request to explain it
 * and nothing red in either unit suite. Measured against a running server on
 * 2026-08-11, on every case.
 *
 * The library ships no layout on this server yet, which is exactly the
 * condition that produces it.
 */
import { describe, expect, it } from 'vitest'

import { BLANK_LAYOUT } from './block-kinds.js'
import { ReportController } from './report.controller.js'
import { reportSchema } from '../domain/entities/report.js'
import { kindOf, reportSnippetSchema } from '../library/kinds.js'

/** One layout, as the library really stores it: rows under `report-layouts`. */
const stockedLibrary = {
  list: () => Promise.resolve([]),
  listWithPayload: (kind: string) =>
    Promise.resolve(
      kind === 'report-layouts'
        ? [
            {
              name: 'nis2-final',
              label: 'NIS2 final',
              origin: 'built-in',
              payload: {
                requiresFeature: 'nis2',
                blocks: [
                  { kind: 'case_header' },
                  { kind: 'written', headingKey: 'heading.exec_summary' },
                  { kind: 'impact' },
                ],
              },
            },
          ]
        : [],
    ),
} as never

/** A library with nothing in it, which is what this server had. */
const emptyLibrary = {
  list: () => Promise.resolve([]),
  listWithPayload: () => Promise.resolve([]),
} as never

/**
 * **English alone, because these assert the layout listing.** The real list is
 * whatever the install stored; `language.controller.test.ts` is where the list
 * itself is checked.
 */
const onlyEnglish = {
  list: () => Promise.resolve([{ code: 'en', label: 'English', coverage: 1, builtin: true }]),
  // The pack answers the key itself for anything it does not carry, which is
  // what `labelFor` falls back from.
  translatorFor: () => Promise.resolve((key: string) => key),
  keyCount: 93,
} as never

describe('the report layouts route', () => {
  it('always offers something to start from, even with an empty library', async () => {
    const listing = await new ReportController(emptyLibrary, onlyEnglish).layouts()
    expect(listing.layouts.length).toBeGreaterThan(0)
    expect(listing.layouts.map((one) => one.name)).toContain(BLANK_LAYOUT)
  })

  it('puts the blank layout last, so a real one is what the form lands on', async () => {
    const listing = await new ReportController(stockedLibrary, onlyEnglish).layouts()
    expect(listing.layouts[0]!.name).toBe('nis2-final')
    expect(listing.layouts.at(-1)!.name).toBe(BLANK_LAYOUT)
  })

  /**
   * **The slug the route asks for has to be one the library stores under.**
   *
   * It asked for `layouts` and `styles`; the library's kinds are
   * `report-layouts` and `report-styles`, and `list` filters on the slug and
   * answers `[]` for anything else - so both lists were unconditionally empty
   * and no error was raised anywhere. **The earlier fix appended a Blank
   * layout so the dialog could be submitted, which cured the symptom and left
   * the cause**: shipping built-in layouts would not have made a single one
   * appear.
   *
   * **The test that should have caught it agreed with the defect** - its stub
   * answered rows for `kind === 'layouts'`, so code and test were wrong
   * together and green.
   */
  it('asks the library for slugs the library actually has', async () => {
    const asked: string[] = []
    const recording = {
      list: (kind: string) => {
        asked.push(kind)
        return Promise.resolve([])
      },
      listWithPayload: (kind: string) => {
        asked.push(kind)
        return Promise.resolve([])
      },
    } as never
    await new ReportController(recording, onlyEnglish).layouts()

    expect(asked.length).toBeGreaterThan(0)
    const strangers = asked.filter((slug) => kindOf(slug) === undefined)
    expect(strangers, 'a slug nothing stores under answers [] and raises nothing').toEqual([])
  })

  /**
   * **A layout's sections come from its payload**, which is what the New
   * report form seeds from and what `missing-sections` derives against. Served
   * as `[]` regardless, every report starts blank whatever the analyst picked.
   */
  it('serves the sections a layout prescribes', async () => {
    const listing = await new ReportController(stockedLibrary, onlyEnglish).layouts()
    // The kinds are what a layout prescribes; the shape around them now also
    // carries the position and the resolved chip label.
    expect(listing.layouts[0]!.blocks.map((one) => one.kind)).toEqual([
      'case_header', 'written', 'impact',
    ])
  })

  /**
   * **A regulatory layout declares itself.** The flag decides whether the form
   * offers a stage, and hardcoding `false` offered none on the four layouts
   * that exist to carry one.
   */
  it('marks a layout that requires the regulatory feature', async () => {
    const listing = await new ReportController(stockedLibrary, onlyEnglish).layouts()
    expect(listing.layouts[0]!.nis2).toBe(true)
    expect(listing.layouts.at(-1)!.nis2).toBe(false)
  })

  /**
   * **The form is offered every language the install stores.** A constant here
   * resolves on `?lang=nl` and in the frozen document while being absent from
   * the only control an analyst has.
   *
   * **Asserted as "passes on what it is given", not against a list.** A pack is
   * a row, so pinning this route to the packs that ship goes quietly
   * meaningless the moment one is uploaded. Whether the list itself is right is
   * `language.controller.test.ts`.
   */
  it('offers whatever languages this install stores, not a list of its own', async () => {
    const uploaded = {
      list: () =>
        Promise.resolve([
          { code: 'en', label: 'English', coverage: 1, builtin: true },
          { code: 'nl', label: 'Nederlands', coverage: 0.65, builtin: true },
          { code: 'de', label: 'Deutsch', coverage: 0.41, builtin: false },
        ]),
      translatorFor: () => Promise.resolve((key: string) => key),
      keyCount: 93,
    } as never
    const listing = await new ReportController(emptyLibrary, uploaded).layouts()
    expect(listing.languages.map((one) => one.code)).toEqual(['en', 'nl', 'de'])
    for (const language of listing.languages) expect(language.label).not.toBe('')
  })

  /**
   * **The client draws these chips and the server sent it strings.**
   *
   * `NewReportDialog` renders `block.kind` and `block.label` for every block a
   * layout prescribes; the route served an array of bare kind names, so every
   * chip rendered empty and every React key was `undefined-undefined`. The
   * client's own type declared objects, which is how the two halves stayed
   * self-consistent and disagreed.
   */
  it('describes a layout block, rather than naming its kind and stopping', async () => {
    const listing = await new ReportController(stockedLibrary, onlyEnglish).layouts()
    const [first] = listing.layouts[0]!.blocks
    expect(first).toMatchObject({ kind: 'case_header', position: 0 })
    expect(typeof first!.label).toBe('string')
    expect(first!.label.length).toBeGreaterThan(0)
  })

  /**
   * **The key, not only the words it resolves to.** A layout titles a written
   * section by `headingKey` and every shipped one does - thirteen written
   * blocks across the built-ins, none with a literal `heading`. The route
   * served `kind`, `position`, `heading` and `label` and dropped the key, so
   * `ReportSection` seeded `heading_key: undefined` and:
   *
   * - `headingFor` fell to `''` and every written section printed **untitled**
   *   in Word, the PDF and the markdown archive;
   * - section identity is `written\0<key>`, so a new NIS2 report reported its
   *   own required section as missing, and `restore-sections` appended a
   *   second, titled copy that never went away.
   *
   * Both client tests fabricated the field on a mocked response and then
   * asserted the seed carried it, so both halves were green.
   */
  it('carries the heading key a layout titles a written section by', async () => {
    const listing = await new ReportController(stockedLibrary, onlyEnglish).layouts()
    const written = listing.layouts[0]!.blocks.find((one) => one.kind === 'written')
    expect(written, 'the fixture layout has a written block').toBeDefined()
    expect(written!.headingKey).toBe('heading.exec_summary')
    // A block that carries no key still answers, rather than being absent.
    const header = listing.layouts[0]!.blocks.find((one) => one.kind === 'case_header')
    expect(header!.headingKey).toBe('')
  })

  /**
   * **The `?lang` the client already sends was ignored.** The route took no
   * query at all, so a Dutch report asked for Dutch headings and was served
   * English ones -- the pack reached the exported file and never the screen.
   */
  it('resolves a heading key through the pack for the language asked for', async () => {
    const dutch = {
      translatorFor: () =>
        Promise.resolve((key: string) =>
          key === 'heading.exec_summary' ? 'Managementsamenvatting' : key,
        ),
      list: () => Promise.resolve([{ code: 'en', label: 'English', coverage: 1, builtin: true }]),
      keyCount: 93,
    } as never

    const listing = await new ReportController(stockedLibrary, dutch).layouts('nl')
    const labels = listing.layouts[0]!.blocks.map((one) => one.label)
    expect(labels).toContain('Managementsamenvatting')
  })

  it('falls back to something readable when the pack has no key for it', async () => {
    // A key the pack does not carry prints the key today. What an analyst
    // needs on a chip is a word, so the kind is what shows instead.
    const listing = await new ReportController(stockedLibrary, onlyEnglish).layouts()
    for (const block of listing.layouts[0]!.blocks) {
      expect(block.label).not.toMatch(/^heading\./)
    }
  })

  /**
   * **The picker groups by slot, and the route read Python's name for it.**
   *
   * Found against the running server: 56 entries served, every one filed under
   * `''`, so the slot chips collapsed to a single unnamed group. `payload.group`
   * is what the TOML files called it; `slot` is what the schema on this server
   * stores. Each half was self-consistent, which is why nothing was red.
   *
   * Built from the real payload schema rather than a hand-written literal, so
   * renaming the field again fails here rather than at a chip.
   */
  it('groups a snippet by the slot its payload actually stores', async () => {
    const stored = reportSnippetSchema.parse({
      slot: 'exec_summary',
      hint: 'opening',
      body: 'A macro-enabled phishing email led to a ransomware incident.',
    })
    const library = {
      list: () => Promise.resolve([]),
      listWithPayload: (kind: string) =>
        Promise.resolve(
          kind === 'report-snippets'
            ? [{ name: 'opener', label: 'Standard opener', origin: 'built-in', payload: stored }]
            : [],
        ),
    } as never

    const served = await new ReportController(library, onlyEnglish).snippets()
    expect(served.snippets[0]!.group).toBe('exec_summary')
  })


  it('leads the stage and marking vocabularies with an empty member', async () => {
    // "No stage" and "unmarked" are real choices rather than the absence of
    // one - a select with no empty member makes its first option the default
    // by accident, and here that would put a regulatory stage on an internal
    // document.
    const listing = await new ReportController(emptyLibrary, onlyEnglish).layouts()
    expect(listing.stages[0]).toBe('')
    expect(listing.tlp[0]).toBe('')
  })
})

describe('the snippet library', () => {
  /**
   * A library holding one snippet with a Dutch translation and one without.
   *
   * **Built through the payload schema, never as a literal.** Written by hand
   * these carried `group` -- Python's name for the slot -- and a map of
   * translations, neither of which this server can store; the route cast
   * rather than parsed, so all three tests below passed against a shape no
   * install could produce. The schema is the only honest fixture.
   */
  const stocked = {
    list: () => Promise.resolve([]),
    listWithPayload: () =>
      Promise.resolve([
        {
          name: 'tier-admin-accounts',
          label: 'Tier the administrative accounts',
          origin: 'built-in',
          payload: reportSnippetSchema.parse({
            slot: 'identity',
            hint: 'where the domain admins can sign in',
            body: 'Separate administrative accounts from day-to-day ones.',
            translations: [
              { language: 'nl', label: 'Beheeraccounts scheiden', body: 'Scheid beheeraccounts.' },
            ],
          }),
        },
        {
          name: 'offline-backup',
          label: 'Keep an offline backup',
          origin: 'yours',
          payload: reportSnippetSchema.parse({
            slot: 'recovery',
            body: 'Keep one copy offline.',
          }),
        },
      ]),
  } as never

  it('answers in the language asked for when the snippet carries it', async () => {
    const served = await new ReportController(stocked, onlyEnglish).snippets('nl')
    const translated = served.snippets.find((one) => one.name === 'tier-admin-accounts')!
    expect(translated.language).toBe('nl')
    expect(translated.body).toBe('Scheid beheeraccounts.')
    // The languages it carries, for a pane offering to fill in the rest. Read
    // off a map this answered with the array's own indices - `['0']`, which no
    // language code will ever match.
    expect(translated.languages).toEqual(['nl'])
  })

  it('says which language answered when it is not the one asked for', async () => {
    // The menu marks a fallback. Reporting `nl` for English prose would pass it
    // off as a translation, and the analyst would paste it into a Dutch report.
    const served = await new ReportController(stocked, onlyEnglish).snippets('nl')
    const untranslated = served.snippets.find((one) => one.name === 'offline-backup')!
    expect(untranslated.language).toBe('en')
    expect(untranslated.body).toBe('Keep one copy offline.')
  })

  it('falls back to the English body rather than to nothing', async () => {
    // A row with an empty body inserts an empty paragraph, which reads as the
    // snippet being broken rather than untranslated.
    const served = await new ReportController(stocked, onlyEnglish).snippets('de')
    for (const snippet of served.snippets) expect(snippet.body).not.toBe('')
  })

  it('serves an empty library rather than refusing', async () => {
    // An install that has added no snippets has none. The `/` menu is opened
    // mid-sentence and a body without `snippets` throws inside the editor's
    // render - the analyst's section vanishes with nothing explaining it.
    const served = await new ReportController(emptyLibrary, onlyEnglish).snippets()
    expect(served).toEqual({ snippets: [], problems: [] })
  })
})

/**
 * The pairing that actually broke: what the form is *offered* against what the
 * create route *accepts*.
 *
 * Each half was right alone. `/api/report-layouts` leads its stage and marking
 * vocabularies with an empty member because "no stage" is a real choice; the
 * create schema took the enum without it. So the dialog offered a value its own
 * server refused, both unit suites stayed green, and the analyst got *the report
 * section was not saved* with nothing they could change to fix it.
 */
describe('what the layouts route offers and the create route takes', () => {
  it('accepts every stage and marking the form is given', async () => {
    const listing = await new ReportController(emptyLibrary, onlyEnglish).layouts()
    for (const stage of listing.stages) {
      const parsed = reportSchema.shape.stage.safeParse(stage)
      expect(parsed.success, `stage ${JSON.stringify(stage)} is offered and refused`).toBe(true)
    }
    for (const marking of listing.tlp) {
      const parsed = reportSchema.shape.tlp.safeParse(marking)
      expect(parsed.success, `marking ${JSON.stringify(marking)} is offered and refused`).toBe(true)
    }
  })

  it('stores the empty choice as null rather than as an empty string', () => {
    // Two spellings for "not stated" is how one of them survives into a report
    // as an answer.
    expect(reportSchema.shape.stage.parse('')).toBeNull()
    expect(reportSchema.shape.tlp.parse('')).toBeNull()
  })

  it('still refuses a stage that is not one of the four', () => {
    expect(reportSchema.shape.stage.safeParse('NIS2 whenever').success).toBe(false)
  })
})
