import { describe, expect, it } from 'vitest'

import { parseCsv, parseCsvTable } from './csv'

describe('parseCsv', () => {
  it('splits a plain comma-delimited file with CRLF line endings', () => {
    expect(parseCsv('a,b,c\r\n1,2,3\r\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('accepts bare LF line endings', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('reads a quoted field carrying a comma', () => {
    expect(parseCsv('name,tags\r\nPC-1,"vip,exec"\r\n')).toEqual([
      ['name', 'tags'],
      ['PC-1', 'vip,exec'],
    ])
  })

  it('unescapes a doubled quote inside a quoted field', () => {
    expect(parseCsv('note\r\n"she said ""hi"""\r\n')).toEqual([
      ['note'],
      ['she said "hi"'],
    ])
  })

  it('reads a quoted field carrying an embedded newline', () => {
    expect(parseCsv('note\r\n"line one\nline two"\r\n')).toEqual([
      ['note'],
      ['line one\nline two'],
    ])
  })

  it('has no trailing empty row after the final newline', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toHaveLength(2)
  })

  it('reads the final row when the file has no trailing newline', () => {
    expect(parseCsv('a,b\r\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('reads a blank physical line as an empty row, not a one-column row', () => {
    expect(parseCsv('a,b\r\n1,2\r\n\r\n3,4\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      [],
      ['3', '4'],
    ])
  })

  it('drops a leading UTF-8 BOM', () => {
    expect(parseCsv('\ufeffa,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('returns an empty array for an empty file', () => {
    expect(parseCsv('')).toEqual([])
  })
})

describe('parseCsvTable', () => {
  it('splits the header from the data rows', () => {
    expect(parseCsvTable('a,b\r\n1,2\r\n3,4\r\n')).toEqual({
      header: ['a', 'b'],
      rows: [
        ['1', '2'],
        ['3', '4'],
      ],
    })
  })

  it('is null for an empty file', () => {
    expect(parseCsvTable('')).toBeNull()
  })

  it('drops a blank line rather than reading it as the header', () => {
    expect(parseCsvTable('\r\na,b\r\n1,2\r\n')).toEqual({
      header: ['a', 'b'],
      rows: [['1', '2']],
    })
  })
})
