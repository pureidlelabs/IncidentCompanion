import { describe, expect, it } from 'vitest'

import { columnWidths, fixedRem, needCh, MAX_CH } from './column-widths'

const col = (id: string, values: string[], className?: string) => ({
  id,
  header: id,
  className,
  values,
})
const px = (w: string | undefined) => Number(/(\d+)px/.exec(w ?? '')?.[1])
const BOX = { width: 1040, rem: 16, ch: 7 }

describe('fixedRem', () => {
  it('reads a spacing-scale width and a bracketed rem, and nothing else', () => {
    expect(fixedRem('w-10')).toBe(2.5)
    expect(fixedRem('w-[16rem] text-right')).toBe(16)
    expect(fixedRem('font-mono w-[12%]')).toBeUndefined()
    expect(fixedRem(undefined)).toBeUndefined()
  })
})

describe('needCh', () => {
  it('wants the 90th percentile of the values, not the longest one', () => {
    const values = [...Array.from({ length: 19 }, () => 'short'), 'x'.repeat(200)]
    const { want } = needCh(col('a', values))
    expect(want).toBeLessThan(MAX_CH)
    expect(want).toBeGreaterThanOrEqual('short'.length)
  })

  it('caps what a column wants, and never wants less than its head', () => {
    expect(needCh(col('a', Array.from({ length: 10 }, () => 'y'.repeat(400)))).want).toBe(MAX_CH)
    const { min, want } = needCh(col('Data classification', ['x']))
    expect(want).toBe(min)
    expect(min).toBeGreaterThan('Data classification'.length)
  })

  it('weights a mono column wider than a sans one of the same length', () => {
    const values = ['a3f5c9d2e1b7486f9a0c3d5e7f1b2a4c']
    expect(needCh(col('a', values, 'font-mono')).want).toBeGreaterThan(needCh(col('a', values)).want)
  })
})

describe('needCh', () => {
  /**
   * The floor is counted from the head's words. Whether the count is wide
   * enough for the head as drawn is not asserted here: jsdom has no glyphs.
   */
  it('floors a column at the width of its own head', () => {
    const { min } = needCh(col('Scope', ['-']))

    // The words, a factor for the uppercase tracking, and the head's chrome.
    expect(min).toBeCloseTo('Scope'.length * 1.25 + 6, 5)
  })

  it('gives a longer head a higher floor', () => {
    expect(needCh(col('Kill chain coverage', ['-'])).min).toBeGreaterThan(
      needCh(col('Host', ['-'])).min,
    )
  })
})

describe('columnWidths', () => {
  it('gives the long column more room than the short one', () => {
    const widths = columnWidths(
      [col('location', ['evidence-vault://acme/2026/wks-finance01/edr-telemetry.zip']), col('type', ['system logs'])],
      BOX,
    )
    expect(px(widths.location)).toBeGreaterThan(px(widths.type))
    expect(px(widths.location) + px(widths.type)).toBeGreaterThanOrEqual(BOX.width - 2)
  })

  it('holds every column at its floor, however much another one wants', () => {
    // Ten columns on a narrow table, one of them wanting everything.
    const many = Array.from({ length: 9 }, (_, i) => col(`Disposition${String(i)}`, ['x']))
    const widths = columnWidths([...many, col('context', ['z'.repeat(400)])], { width: 900, rem: 16, ch: 7 })
    for (const one of many) {
      expect(px(widths[one.id])).toBeGreaterThanOrEqual(needCh(one).min * 7)
    }
  })

  it('gives a short column its values before a long one takes the surplus', () => {
    // Hostname (13 chars) beside zone (17 chars) and a wide head: none may sit at its floor
    // while another swallows the room.
    const widths = columnWidths(
      [
        col('Hostname', ['WKS-FINANCE01']),
        col('Zone', ['internal - client']),
        col('Analysis status', ['in progress']),
      ],
      BOX,
    )
    expect(px(widths.Hostname)).toBeGreaterThanOrEqual(
      needCh(col('Hostname', ['WKS-FINANCE01'])).want * BOX.ch,
    )
    expect(px(widths.Zone) / px(widths.Hostname)).toBeLessThan(2)
  })

  it('keeps a fixed column at its rem and shares the measured remainder in pixels', () => {
    const widths = columnWidths(
      [col('select', [], 'w-10'), col('name', ['WKS-FINANCE01 EDR telemetry export']), col('host', ['FS-01'])],
      BOX,
    )
    expect(widths.select).toBe('2.5rem')
    expect(px(widths.name)).toBeGreaterThan(px(widths.host))
    expect(px(widths.name) + px(widths.host)).toBeGreaterThanOrEqual(998)
    expect(px(widths.name) + px(widths.host)).toBeLessThanOrEqual(1000)
  })

  it('never resolves to calc(), which a fixed table layout ignores', () => {
    const widths = columnWidths([col('select', [], 'w-10'), col('name', ['a']), col('host', ['b'])], BOX)
    expect(Object.values(widths).join(' ')).not.toContain('calc')
  })

  it('falls back to percentages before the table is measured', () => {
    const widths = columnWidths([col('a', ['aaaa']), col('b', ['bb'])])
    expect(widths.a).toMatch(/%$/)
  })

  it('leaves a table of only fixed columns alone', () => {
    expect(columnWidths([col('a', [], 'w-10')], BOX)).toEqual({ a: '2.5rem' })
  })
})
