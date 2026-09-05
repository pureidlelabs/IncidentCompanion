import { describe, expect, it } from 'vitest'

import type { SystemEntry, MalwareEntry, TimelineEntry } from '@/api/model'
import { formSpec } from '@/api/specs'
import { specsFixture } from '@/fixtures/specs'
import { parseCsv, parseCsvTable } from '@/lib/csv'

import {
  buildPreview,
  buildSubmission,
  mapColumns,
  parseRowError,
  previewIndexForServerRow,
  adviceFor,
} from './csv-import'

const systemForm = formSpec<SystemEntry>(specsFixture, 'SYSTEM_FIELDS')
const malwareForm = formSpec<MalwareEntry>(specsFixture, 'MALWARE_FIELDS')
const timelineForm = formSpec<TimelineEntry>(specsFixture, 'TIMELINE_ACTION_FIELDS')

/**
 * A row as this application's CSV export writes it, transcribed.
 */
const OWN_EXPORT =
  'id,case_id,hostname,system_type,verdict,analysis_status,analyst,source,isolated,' +
  'isolated_at,zone,method_id,tags,version,created_at,updated_at,created_by,updated_by\r\n' +
  'sys-1,case-1,PC-1,desktop,compromised,in progress,J. Analyst,SIEM,true,,dmz,,"vip,exec",' +
  '3,2026-08-30T09:00:00.000Z,2026-08-31T11:00:00.000Z,analyst-1,analyst-1\r\n'

/**
 * What the export carries and the form does not offer a control for, in the
 * order the export writes them.
 */
const NOT_THE_ANALYST_S_TO_SET = [
  'id',
  'case_id',
  'source',
  'version',
  'created_at',
  'updated_at',
  'created_by',
  'updated_by',
]

describe('mapColumns', () => {
  it('matches a header to a form field by camelising it', () => {
    const mapping = mapColumns(['hostname', 'system_type'], systemForm)
    expect(mapping).toEqual([
      { header: 'hostname', field: 'hostname' },
      { header: 'system_type', field: 'systemType' },
    ])
  })

  it('excludes id and a _display companion column -- neither is a form field', () => {
    const mapping = mapColumns(['id', 'system_id', 'system_id_display'], malwareForm)
    expect(mapping).toEqual([
      { header: 'id', field: null },
      { header: 'system_id', field: 'systemId' },
      { header: 'system_id_display', field: null },
    ])
  })
})

/**
 * **Not a round trip, and it was named for one.**
 */
describe("reading back this application's own export", () => {
  it('maps every field the form offers and nothing the export adds', () => {
    const table = parseCsvTable(OWN_EXPORT)
    if (!table) throw new Error('expected a table')
    const preview = buildPreview(table, systemForm, 'systems', [])

    // `source` is a stored `SystemEntry` field but not one `SYSTEM_FIELDS`
    // offers a control for -- it maps like `id` does, to no field at all.
    expect(preview.unmappedHeaders).toEqual(NOT_THE_ANALYST_S_TO_SET)
    expect(preview.rows).toHaveLength(1)
    expect(preview.rows[0]?.problems).toEqual([])
    expect(preview.rows[0]?.values).toMatchObject({
      hostname: 'PC-1',
      systemType: 'desktop',
      verdict: 'compromised',
      isolated: 'true',
      // The preview holds the cell as parsed; `''` becomes `null` on submit,
      // which the coercion test below covers.
      methodId: '',
      tags: 'vip,exec',
    })
  })


  it('coerces the exported boolean text into a real boolean on submit', () => {
    const table = parseCsvTable(OWN_EXPORT)
    if (!table) throw new Error('expected a table')
    const preview = buildPreview(table, systemForm, 'systems', [])
    const { rows } = buildSubmission(preview, systemForm)
    expect(rows[0]?.isolated).toBe(true)
    expect(rows[0]?.hostname).toBe('PC-1')
  })

  /**
   * **The spellings a file can carry, which is more than this app writes.**
   *
   * Asserted rather than left to the implementation, because the case-folding
   * is one `.toLowerCase()` away from being dropped as redundant by somebody
   * reading only what this app writes today.
   */
  it.each([
    ['true', true],
    ['True', true],
    ['TRUE', true],
    ['yes', true],
    ['1', true],
    ['false', false],
    ['False', false],
    ['', false],
    ['no', false],
  ])('reads %o as %o on submit', (written, expected) => {
    const table = parseCsvTable(`hostname,isolated\r\nPC-9,${written}\r\n`)
    if (!table) throw new Error('expected a table')
    const preview = buildPreview(table, systemForm, 'systems', [])
    const { rows } = buildSubmission(preview, systemForm)
    expect(rows[0]?.isolated).toBe(expected)
  })
})

describe('a quoting edge the app\'s export can produce', () => {
  it('reads a tag list with an embedded comma back out whole', () => {
    const text = 'hostname,tags\r\nPC-2,"a,b,c"\r\n'
    const table = parseCsvTable(text)
    if (!table) throw new Error('expected a table')
    expect(table.rows[0]).toEqual(['PC-2', 'a,b,c'])
  })
})

describe('per-row type problems', () => {
  it('flags a select value outside the offered vocabulary', () => {
    const table = parseCsvTable('hostname,system_type\r\nPC-1,not-a-real-type\r\n')
    if (!table) throw new Error('expected a table')
    const preview = buildPreview(table, systemForm, 'systems', [])
    expect(preview.rows[0]?.problems).toEqual([
      'Asset type: "not-a-real-type" is not one of the offered options',
    ])
  })

  it('flags a missing required field', () => {
    const table = parseCsvTable('system_type\r\ndesktop\r\n')
    if (!table) throw new Error('expected a table')
    const preview = buildPreview(table, systemForm, 'systems', [])
    expect(preview.rows[0]?.problems).toEqual([
      'Name (hostname, mailbox, or app name) is required',
    ])
  })

  it('flags an unparseable checkbox value', () => {
    const table = parseCsvTable('hostname,isolated\r\nPC-1,maybe\r\n')
    if (!table) throw new Error('expected a table')
    const preview = buildPreview(table, systemForm, 'systems', [])
    expect(preview.rows[0]?.problems).toEqual(['Isolated: "maybe" is not a yes/no value'])
  })

  it('accepts every boolean spelling the server accepts, case-insensitively', () => {
    const table = parseCsvTable('hostname,isolated\r\nPC-1,YES\r\nPC-2,0\r\nPC-3,\r\n')
    if (!table) throw new Error('expected a table')
    const preview = buildPreview(table, systemForm, 'systems', [])
    expect(preview.rows.map((row) => row.problems)).toEqual([[], [], []])
  })

  it('flags a row whose column count does not match the header', () => {
    const header = ['hostname', 'system_type']
    const table = { header, rows: [['PC-1']] }
    const preview = buildPreview(table, systemForm, 'systems', [])
    expect(preview.rows[0]?.problems).toEqual([
      'row has 1 column(s); the header has 2',
    ])
  })
})

describe('duplicate detection', () => {
  const existingSystems: SystemEntry[] = [
    {
      id: 'sys-existing',
      version: 1,
      hostname: 'PC-1',
      systemType: 'desktop',
      verdict: 'unknown',
      analysisStatus: 'open',
      analyst: '',
      source: '',
      isolated: false,
      isolatedAt: null,
      zone: 'external',
      methodId: null,
      tags: '',
    },
  ]

  it('flags a row whose hostname already exists in the case, defaulting it to skip', () => {
    const table = parseCsvTable('hostname\r\nPC-1\r\nPC-2\r\n')
    if (!table) throw new Error('expected a table')
    const preview = buildPreview(table, systemForm, 'systems', existingSystems)
    expect(preview.rows[0]).toMatchObject({ duplicate: true, skip: true })
    expect(preview.rows[1]).toMatchObject({ duplicate: false, skip: false })
  })

  it('flags the second of two rows that duplicate each other within the same file', () => {
    const table = parseCsvTable('hostname\r\nPC-9\r\nPC-9\r\n')
    if (!table) throw new Error('expected a table')
    const preview = buildPreview(table, systemForm, 'systems', [])
    expect(preview.rows[0]).toMatchObject({ duplicate: false })
    expect(preview.rows[1]).toMatchObject({ duplicate: true, skip: true })
  })

  it('matches malware by hash, case- and whitespace-insensitively', () => {
    const existing: MalwareEntry[] = [
      {
        id: 'm1',
        version: 1,
        filename: 'evil.exe',
        systemId: null,
        accountId: null,
        hash: 'ABC123',
        verdict: 'unknown',
        family: '',
        signature: '',
        firstSeen: null,
        source: '',
        methodId: null,
        tags: '',
      },
    ]
    const table = parseCsvTable('filename,hash\r\nother.exe, abc123 \r\n')
    if (!table) throw new Error('expected a table')
    const preview = buildPreview(table, malwareForm, 'malware', existing)
    expect(preview.rows[0]?.duplicate).toBe(true)
  })

  it('offers no duplicate detection at all for a table with no natural key', () => {
    const table = parseCsvTable('description,time,action_type\r\nsame,2024-01-01T00:00:00Z,other\r\n')
    if (!table) throw new Error('expected a table')
    const preview = buildPreview(table, timelineForm, 'timeline', [])
    expect(preview.rows[0]?.duplicate).toBe(false)
  })
})

describe('list-field coercion', () => {
  it('splits a multi_device_select column on semicolons into an array', () => {
    const table = parseCsvTable('description,time,action_type,account_ids\r\nx,2024-01-01T00:00:00Z,other,a1;a2\r\n')
    if (!table) throw new Error('expected a table')
    const preview = buildPreview(table, timelineForm, 'timeline', [])
    const { rows } = buildSubmission(preview, timelineForm)
    expect(rows[0]?.accountIds).toEqual(['a1', 'a2'])
  })

  it('an empty multi_device_select cell submits as an empty array, not a one-item list', () => {
    const table = parseCsvTable('description,time,action_type,account_ids\r\nx,2024-01-01T00:00:00Z,other,\r\n')
    if (!table) throw new Error('expected a table')
    const preview = buildPreview(table, timelineForm, 'timeline', [])
    const { rows } = buildSubmission(preview, timelineForm)
    expect(rows[0]?.accountIds).toEqual([])
  })
})

describe('buildSubmission', () => {
  it('drops skipped rows from the array and records what each sent row maps back to', () => {
    const table = parseCsvTable('hostname\r\nPC-1\r\nPC-1\r\nPC-3\r\n')
    if (!table) throw new Error('expected a table')
    const preview = buildPreview(table, systemForm, 'systems', [])
    // Row 1 (index 0) is the first PC-1, kept; row 2 (index 1) is the
    // duplicate, defaulted to skip; row 3 (index 2) is kept.
    const { rows, refs } = buildSubmission(preview, systemForm)
    expect(rows).toHaveLength(2)
    expect(refs).toEqual([0, 2])
  })
})

describe('row-N error mapping', () => {
  it('parses the server\'s "row N: ..." shape', () => {
    expect(parseRowError('row 3: SystemEntry has no field \'nope\'')).toEqual({
      row: 3,
      detail: "SystemEntry has no field 'nope'",
    })
  })

  it('returns null for a message with no row prefix', () => {
    expect(parseRowError('CSV exceeds the 1000 row import limit')).toBeNull()
  })

  it('maps the server\'s row number back to the preview row it came from', () => {
    // Preview row 1 was skipped (a duplicate); rows 0 and 2 were submitted,
    // becoming the server's row 1 and row 2 respectively.
    const refs = [0, 2]
    expect(previewIndexForServerRow(1, refs)).toBe(0)
    expect(previewIndexForServerRow(2, refs)).toBe(2)
    expect(previewIndexForServerRow(3, refs)).toBeNull()
  })
})

describe('parseCsv still splits a plain row (sanity: the module under test reads via parseCsvTable)', () => {
  it('is exercised through the table helper above, not directly here', () => {
    expect(parseCsv('a\r\n1\r\n')).toEqual([['a'], ['1']])
  })
})

describe('a reference the case does not have', () => {
  /**
   * **The likeliest refusal on an import, and the least self-explanatory.**
   *
   * **It cannot say the row is in another case.** The server answers an id
   * that exists elsewhere and one that exists nowhere with the same words, on
   * purpose -- telling them apart reveals whether a row exists in a case the
   * caller cannot see. This names the common cause without claiming it.
   */
  it('explains what to do about it', () => {
    expect(adviceFor('No such row in this case: systemId.')).toContain('another case')
    expect(adviceFor('No such rows in this case: systemId, accountId.')).toContain('another case')
  })

  it('says nothing about any other refusal', () => {
    expect(adviceFor("SystemEntry has no field 'nope'")).toBeNull()
    expect(adviceFor('Validation failed')).toBeNull()
    expect(adviceFor('')).toBeNull()
  })
})
