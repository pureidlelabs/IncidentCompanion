/**
 * The decidable half of the capability audit: scoping, name collapsing,
 * families.
 *
 * **Here rather than in `e2e/`, because it needs no browser** - the same
 * reason `visual-baseline.test.ts` next to it gives. The browser half of the
 * audit cannot be unit tested and is not attempted here; what is asserted is
 * every judgement the tool makes once it has the readings.
 *
 * The cases are written from the ways the tool can be *wrong and look right*:
 * a key that collapses two different actions into one, a family that buckets
 * components which were never alike, and a reading that counts an
 * `opacity: 0` control as present.
 */
import { describe, expect, it } from 'vitest'

import {
  affordanceKey,
  componentsOf,
  capabilitiesOf,
  familyOf,
  normaliseName,
  siblingGaps,
  slugOf,
  parseSnapshot,
  surfaceOf,
  unreachableWithinStories,
  wordsOf,
  type StoryEntry,
} from '../e2e/visual/affordance-audit.js'

function story(importPath: string, name = 'Default', title = 'T'): StoryEntry {
  return { id: `${importPath}--${name}`, title, name, importPath, type: 'story' }
}

describe('which surface a story belongs to', () => {
  it('reads a block and a screen apart by directory', () => {
    expect(surfaceOf('./src/components/blocks/data-table.stories.tsx')).toBe('block')
    expect(surfaceOf('./src/screens/accounts.stories.tsx')).toBe('screen')
  })

  /**
   * A family is a set of components that owe each other the same controls, and
   * a primitive owes nothing to the screens built from it. Counting the kit
   * puts findings at the top of the report that no screen can act on.
   */
  it('leaves the kit and anything outside the two surfaces out of scope', () => {
    expect(surfaceOf('./src/components/ui/button.stories.tsx')).toBeNull()
    expect(surfaceOf('./src/fixtures/railMenus.tsx')).toBeNull()
  })

  it('takes the story extension off a slug', () => {
    expect(slugOf('./src/components/blocks/row-actions.stories.tsx')).toBe('row-actions')
    expect(slugOf('./src/screens/picker-health.stories.ts')).toBe('picker-health')
  })
})

describe('splitting a file name into words', () => {
  it('splits PascalCase, kebab-case and runs of capitals alike', () => {
    expect(wordsOf('KillchainCoverageSection')).toEqual(['killchain', 'coverage', 'section'])
    expect(wordsOf('cloud-apps')).toEqual(['cloud', 'apps'])
    expect(wordsOf('CSVImportControl')).toEqual(['csv', 'import', 'control'])
  })
})

describe('grouping a Storybook index into components', () => {
  it('buckets by source file rather than by story', () => {
    const components = componentsOf([
      story('./src/screens/accounts.stories.tsx', 'Default'),
      story('./src/screens/accounts.stories.tsx', 'Empty'),
      story('./src/components/blocks/data-table.stories.tsx'),
    ])

    expect(components.map((one) => one.slug)).toEqual(['data-table', 'accounts'])
    expect(components.find((one) => one.slug === 'accounts')?.stories).toHaveLength(2)
  })

  /**
   * A docs entry renders MDX rather than the component, so every control on
   * one belongs to Storybook. Counted, they are a capability every component
   * with a docs page appears to have and its siblings appear to lack.
   */
  it('drops docs entries and anything outside the two surfaces', () => {
    const components = componentsOf([
      { ...story('./src/screens/accounts.stories.tsx'), type: 'docs' },
      story('./src/components/ui/button.stories.tsx'),
      story('./src/components/blocks/data-table.stories.tsx'),
    ])

    expect(components.map((one) => one.slug)).toEqual(['data-table'])
  })

  it('carries the surface, so a block is not filed with the table screens', () => {
    const components = componentsOf([
      story('./src/components/blocks/data-table.stories.tsx'),
      story('./src/screens/accounts-table.stories.tsx'),
    ])

    expect(components.map((one) => [one.slug, one.surface])).toEqual([
      ['data-table', 'block'],
      ['accounts-table', 'screen'],
    ])
  })
})

describe('collapsing an accessible name to a capability', () => {
  it('brings the two tiers wordings of one action together', () => {
    expect(affordanceKey('button', 'Edit DC-01 in full')).toBe(affordanceKey('button', 'Edit'))
    expect(affordanceKey('button', 'More for DC-01')).toBe(affordanceKey('button', 'More'))
    expect(affordanceKey('button', 'Delete SRV-114')).toBe(affordanceKey('button', 'Delete'))
  })

  it('keeps two actions apart when they share only their verb', () => {
    expect(affordanceKey('button', 'Add note')).not.toBe(affordanceKey('button', 'Add entity'))
  })

  it('keeps the role, so a link and a button of one name are two affordances', () => {
    expect(affordanceKey('link', 'Overview')).not.toBe(affordanceKey('button', 'Overview'))
  })

  it('collapses every row of a table onto one key', () => {
    const keys = ['Edit DC-01', 'Edit SRV-114', 'Edit mail.contoso.com'].map((name) =>
      affordanceKey('button', name),
    )
    expect(new Set(keys).size).toBe(1)
  })

  it('normalises punctuation and case out of a name', () => {
    expect(normaliseName('  Edit... (DC-01)  ')).toBe('edit dc 01')
  })
})

describe('a control that no gesture reveals, story by story', () => {
  it('names a control that is in the DOM of one story and reachable in none of it', () => {
    // This is the defect the whole audit was built after: the row-action
    // cluster is on every row and computes `opacity: 0` at rest, on hover and
    // on focus. Asked of a component's stories as a set it is invisible - the
    // selection story reveals the cluster, so the union says the capability is
    // there. Asked story by story it is exactly what it is.
    const out = unreachableWithinStories([
      {
        storyId: 'rows',
        affordances: [
          { role: 'button', name: 'More for DC-01', via: 'hover', blocked: 'opacity 0' },
          { role: 'button', name: 'More for FS-01', via: 'hover', blocked: 'opacity 0' },
        ],
      },
      {
        storyId: 'selection',
        affordances: [{ role: 'button', name: 'More for DC-01', via: 'rest' }],
      },
    ])
    expect(out).toEqual([
      {
        key: 'button:more',
        storyId: 'rows',
        why: 'opacity 0',
        names: ['More for DC-01', 'More for FS-01'],
      },
    ])
  })

  it('says nothing about a control the same story reveals under a gesture', () => {
    const out = unreachableWithinStories([
      {
        storyId: 'rows',
        affordances: [
          { role: 'button', name: 'More', via: 'rest', blocked: 'opacity 0' },
          { role: 'button', name: 'More', via: 'hover' },
        ],
      },
    ])
    expect(out).toEqual([])
  })

  it('does not report row four because only rows one to three were hovered', () => {
    // The pointer walks the first rows and no further, so every row past them
    // holds a cluster that was never revealed. Their names differ - the row's
    // own subject is in the label - so a key comparison calls each one its own
    // finding, and one table is a report of its own length.
    const out = unreachableWithinStories([
      {
        storyId: 'populated',
        affordances: [
          { role: 'button', name: 'Edit DC-01 in full', via: 'hover' },
          { role: 'button', name: 'Edit Ransom note readme_decrypt.txt found', via: 'rest', blocked: 'opacity 0' },
          { role: 'button', name: 'Edit Files encrypted on WKS-ENG04', via: 'rest', blocked: 'opacity 0' },
        ],
      },
    ])
    expect(out).toEqual([])
  })

  it('still reports a shape no row of that kind ever revealed', () => {
    const out = unreachableWithinStories([
      {
        storyId: 'populated',
        affordances: [
          { role: 'button', name: 'Edit DC-01 in full', via: 'hover' },
          { role: 'button', name: 'More for DC-01', via: 'rest', blocked: 'opacity 0' },
        ],
      },
    ])
    expect(out.map((one) => one.key)).toEqual(['button:more'])
  })

  it('reports one story per key rather than one finding per row', () => {
    const rows = Array.from({ length: 30 }, (_, at) => ({
      role: 'button',
      name: `Edit host-${String(at)}`,
      via: 'hover',
      blocked: 'opacity 0',
    }))
    const out = unreachableWithinStories([{ storyId: 'rows', affordances: rows }])
    expect(out).toHaveLength(1)
    // Four names is enough to recognise it; thirty is a report nobody reads.
    expect(out[0]?.names).toHaveLength(4)
  })
})

describe('where a control sits, read out of the ARIA snapshot', () => {
  const snapshot = [
    '- banner:',
    '  - button "Fold the rail"',
    '  - button "Search"',
    '- table:',
    '  - rowgroup:',
    '    - row "Header":',
    '      - cell:',
    '        - button "Outstanding"',
    '      - cell:',
    '        - button "Updated"',
    '  - rowgroup:',
    '    - row "DC-01 Windows server":',
    '      - cell:',
    '        - checkbox "Select row DC-01"',
    '      - cell:',
    '        - button "Edit DC-01"',
    '    - row "SRV-02 Windows server":',
    '      - cell:',
    '        - checkbox "Select row SRV-02"',
    '- paragraph: some prose',
    '- button "Loose"',
  ].join('\n')

  it('names the nearest landmark ancestor rather than the wrapper the control sits in', () => {
    const out = parseSnapshot(snapshot)
    const edit = out.find((one) => one.name === 'Edit DC-01')
    // `cell` is a wrapper: pairing on it would put every table control at
    // ordinal 0 and the position would carry nothing.
    expect(edit?.container).toBe('row:')
  })

  it('counts a control among its landmark siblings, restarting for the next row', () => {
    const out = parseSnapshot(snapshot)
    expect(out.find((one) => one.name === 'Select row DC-01')?.ordinal).toBe(0)
    expect(out.find((one) => one.name === 'Edit DC-01')?.ordinal).toBe(1)
    // A second row is a second container, so its first control is 0 again -
    // otherwise every row after the first pairs against nothing.
    expect(out.find((one) => one.name === 'Select row SRV-02')?.ordinal).toBe(0)
  })

  it('keeps two toolbar controls apart by position', () => {
    const out = parseSnapshot(snapshot)
    expect(out.find((one) => one.name === 'Fold the rail')).toMatchObject({
      container: 'banner:',
      ordinal: 0,
    })
    expect(out.find((one) => one.name === 'Search')?.ordinal).toBe(1)
  })

  it('gives a control under no landmark a container of its own', () => {
    expect(parseSnapshot(snapshot).find((one) => one.name === 'Loose')?.container).toBe('')
  })

  it('drops the row s own subject from the container, so two rows share one key', () => {
    const out = parseSnapshot(snapshot)
    const containers = new Set(
      out.filter((one) => one.name.startsWith('Select row')).map((one) => one.container),
    )
    expect([...containers]).toEqual(['row:'])
  })

  it('puts a sortable column button in its own column, not in the header row', () => {
    // Taken off a real snapshot of `screens-entities-accounts--populated`.
    // Without this the sibling check cannot tell a column from a capability,
    // and every entity table's own columns read as gaps in the others.
    const grid = [
      '- grid "Accounts":',
      '  - rowgroup:',
      '    - row "Select every row Account name Source":',
      '      - columnheader "Select every row":',
      '        - checkbox "Select every row"',
      '      - columnheader "Account name":',
      '        - button "Account name"',
      '      - columnheader "Source":',
      '        - button "Source"',
    ].join('\n')
    const out = parseSnapshot(grid)
    expect(out.find((one) => one.name === 'Account name')?.container).toBe(
      'columnheader:account name',
    )
    expect(out.find((one) => one.name === 'Select every row')?.container).toBe(
      'columnheader:select every',
    )
  })

  it('does not let a header row be named after the columns in it', () => {
    const one = parseSnapshot('- row "Report Stage Outstanding":\n  - button "Outstanding"')
    const other = parseSnapshot('- row "Report Stage Written":\n  - button "Written"')
    expect(one[0]?.container).toBe(other[0]?.container)
    expect(one[0]?.container).toBe('row:')
  })

  it('reads only the roles a person acts on', () => {
    expect(parseSnapshot(snapshot).map((one) => one.role)).not.toContain('cell')
    expect(parseSnapshot(snapshot).map((one) => one.role)).not.toContain('paragraph')
  })

  it('unescapes a quoted name and survives a name holding a quote', () => {
    const out = parseSnapshot('- button "Edit \\"DC-01\\""')
    expect(out[0]?.name).toBe('Edit "DC-01"')
  })
})

describe('a screen disagreeing with its own siblings', () => {
  function member(family: string, name: string, keys: string[]) {
    return { family, member: name, keys }
  }

  const entities = ['Accounts', 'Assets', 'Malware', 'Network', 'CloudApps', 'Identities']

  it('reads the family out of what the file calls itself, not out of a list', () => {
    expect(familyOf('screen', 'AccountsTable')).toBe('screen/table')
    expect(familyOf('screen', 'EvidenceTable')).toBe('screen/table')
    expect(familyOf('block', 'data-table')).toBe('block/table')
    expect(familyOf('screen', 'OverviewForm')).toBe('screen/form')
  })

  it('keeps a block out of the screens family whose shape word it shares', () => {
    expect(familyOf('block', 'data-table')).not.toBe(familyOf('screen', 'AccountsTable'))
  })

  it('puts a screen naming no shape in no family', () => {
    // `ReportIndex` and `CasePicker` say nothing about what they are, and a
    // bucket of everything unnamed is where the noise comes from: unrelated
    // screens under one title read as one family.
    expect(familyOf('screen', 'ReportIndex')).toBe('')
    expect(familyOf('screen', 'CasePicker')).toBe('')
  })

  it('leaves a sortable column out of what a screen can do', () => {
    const keys = capabilitiesOf([
      { role: 'button', name: 'Account name', via: 'rest', container: 'columnheader:account name', ordinal: 0 },
      { role: 'button', name: 'Expand row', via: 'rest', container: 'row:', ordinal: 1 },
      { role: 'button', name: 'Never revealed', via: 'rest', container: 'row:', ordinal: 2, blocked: 'opacity 0' },
    ])
    expect(keys).toEqual(['button:expand'])
  })

  it('reports the one sibling that cannot do what the other five can', () => {
    const members = entities.map((one) =>
      member('Screens/Entities', one, one === 'Malware' ? ['button:edit'] : ['button:edit', 'button:expand']),
    )
    const gaps = siblingGaps(members)
    expect(gaps).toHaveLength(1)
    expect(gaps[0]).toMatchObject({
      family: 'Screens/Entities',
      key: 'button:expand',
      lack: ['Malware'],
    })
  })

  it('reports the one sibling that can do what the other five cannot', () => {
    const members = entities.map((one) =>
      member('Screens/Entities', one, one === 'Accounts' ? ['button:edit', 'button:expand'] : ['button:edit']),
    )
    // `button:expand` is vocabulary the app uses elsewhere, so it is a
    // question rather than one screen's own label.
    const gaps = siblingGaps([...members, member('Screens/Report', 'Index', ['button:expand'])])
    expect(gaps.filter((one) => one.family === 'Screens/Entities')).toHaveLength(1)
    expect(gaps[0]?.have).toEqual(['Accounts'])
  })

  it('says nothing about a label only one screen was ever going to have', () => {
    const members = entities.map((one) => member('Screens/Entities', one, ['button:edit', `textbox:${one.toLowerCase()} name`]))
    expect(siblingGaps(members)).toHaveLength(0)
  })

  it('says nothing about an even split, which is two designs rather than a gap', () => {
    const members = entities.map((one, at) =>
      member('Screens/Entities', one, at % 2 === 0 ? ['button:edit', 'button:expand'] : ['button:edit']),
    )
    expect(siblingGaps(members)).toHaveLength(0)
  })

  it('leaves a family of two alone, where there is no majority to disagree with', () => {
    // One of two is half, and half is the even split the rule above refuses.
    // The vocabulary is deliberately in use elsewhere, so it is the family's
    // size doing the work here and not the one-off filter.
    const members = [
      member('Screens/Auth', 'SignIn', ['button:submit', 'button:show password']),
      member('Screens/Auth', 'Reset', ['button:submit']),
      member('Screens/Entities', 'Accounts', ['button:show password']),
      member('Screens/Entities', 'Assets', ['button:show password']),
      member('Screens/Entities', 'Malware', ['button:show password']),
    ]
    expect(siblingGaps(members).filter((one) => one.family === 'Screens/Auth')).toHaveLength(0)
  })

  it('keeps two families apart', () => {
    const gaps = siblingGaps([
      ...entities.map((one) => member('Screens/Entities', one, ['button:edit'])),
      member('Screens/Report', 'Index', ['button:edit', 'button:more']),
      member('Screens/Report', 'Editor', ['button:edit', 'button:more']),
      member('Screens/Report', 'Preview', ['button:edit']),
    ])
    expect(gaps.map((one) => `${one.family} ${one.key}`)).toEqual(['Screens/Report button:more'])
  })
})
