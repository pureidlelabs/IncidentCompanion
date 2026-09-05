import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { globSync } from 'tinyglobby'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  CODE_LANGUAGES,
  gutterWidth,
  MAX_HIGHLIGHT_CHARS,
  MAX_HIGHLIGHT_LINES,
  highlightCode,
  isHighlightable,
  loadedGrammars,
  normaliseCode,
  resetHighlighter,
  resolveLanguage,
  toPlainLines,
} from './code-block-highlight'

/**
 * The highlighter, attacked at what a paste can do to it.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const UI_SRC = join(HERE, '..', '..')
const TOKENS = readFileSync(join(UI_SRC, 'styles', 'tokens.css'), 'utf8')

/** The source a line's runs claim to be. */
const textOf = (lines: { content: string }[][]) =>
  lines.map((line) => line.map((token) => token.content).join('')).join('\n')

beforeEach(() => {
  resetHighlighter()
})

describe('which languages exist', () => {
  it('holds the allowlist and nothing else', () => {
    expect([...CODE_LANGUAGES]).toEqual(['bash', 'json', 'kql', 'powershell'])
  })

  it.each([
    ['ps1', 'powershell'],
    ['ps', 'powershell'],
    ['PowerShell', 'powershell'],
    ['  PWSH  ', 'powershell'],
    // shiki's own id for the grammar, which is not what an analyst calls it.
    ['kusto', 'kql'],
    ['KQL', 'kql'],
    ['zsh', 'bash'],
    ['sh', 'bash'],
    ['console', 'bash'],
    // Likewise: shiki's id is `shellscript`, and the allowlist is keyed on
    // `bash` because that is the word on the button.
    ['shellscript', 'bash'],
    ['shell', 'bash'],
    ['jsonc', 'json'],
  ])('resolves %j onto %j', (given, expected) => {
    expect(resolveLanguage(given)).toBe(expected)
  })

  it.each([
    // Real shiki grammars, deliberately not in the allowlist. If one of these
    // ever resolves, the allowlist has stopped being one and the bundle
    // argument with it.
    'python',
    'typescript',
    'cpp',
    'sql',
    'yaml',
    'diff',
    'log',
    'reg',
    // And the shapes a caller actually gets wrong.
    'plaintext',
    'text',
    '',
    '   ',
    'powershell5',
    'json5',
    '../../etc/passwd',
  ])('refuses %j', (given) => {
    expect(resolveLanguage(given)).toBeUndefined()
  })

  it('refuses an absent language rather than guessing one', () => {
    expect(resolveLanguage(undefined)).toBeUndefined()
  })
})

describe('what earns a grammar pass', () => {
  const line = 'Get-Process | Where-Object { $_.CPU -gt 10 }\n'

  it('takes a paste at the line ceiling and refuses the one past it', () => {
    const atCeiling = 'x\n'.repeat(MAX_HIGHLIGHT_LINES - 1) + 'x'
    expect(atCeiling.split('\n')).toHaveLength(MAX_HIGHLIGHT_LINES)
    expect(isHighlightable(atCeiling, 'powershell')).toBe(true)
    expect(isHighlightable(`${atCeiling}\nx`, 'powershell')).toBe(false)
  })

  it('refuses a five thousand line paste', () => {
    expect(isHighlightable(line.repeat(5000), 'powershell')).toBe(false)
  })

  it('refuses on characters even when the line count is small', () => {
    // Minified JSON is one line and megabytes wide. A line-only ceiling reads
    // it as trivial and hands the tokeniser the whole thing.
    const oneHugeLine = 'a'.repeat(MAX_HIGHLIGHT_CHARS + 1)
    expect(oneHugeLine.split('\n')).toHaveLength(1)
    expect(isHighlightable(oneHugeLine, 'json')).toBe(false)
  })

  it('refuses whatever the size when the language is unknown', () => {
    expect(isHighlightable('hello', 'brainfuck')).toBe(false)
    expect(isHighlightable('hello', undefined)).toBe(false)
  })
})

describe('the grammars load lazily, and only the one asked for', () => {
  it('has fetched nothing before anything is highlighted', () => {
    expect(loadedGrammars()).toEqual([])
  })

  it('fetches one grammar for one language, and no others', async () => {
    await highlightCode('SecurityEvent | take 1', 'kql')
    expect(loadedGrammars()).toEqual(['kql'])
    await highlightCode('{"a":1}', 'json')
    expect(loadedGrammars()).toEqual(['json', 'kql'])
  })

  it('fetches nothing for a language it refuses', async () => {
    await highlightCode('def f(): pass', 'python')
    expect(loadedGrammars()).toEqual([])
  })

  it('fetches nothing for a paste past the ceiling', async () => {
    await highlightCode('x\n'.repeat(MAX_HIGHLIGHT_LINES + 1), 'powershell')
    expect(loadedGrammars()).toEqual([])
  })

  /**
   * **The zero-bytes-in-the-initial-bundle claim, as a source rule.**
   *
   * A single static `import ... from 'shiki'` anywhere in `ui/src` pulls the
   * barrel, and with it every grammar shiki bundles -- so the measured cost of
   * this component stops being deferred and nothing renders differently.
   * A runtime test cannot see it; the bundler decides at build time.
   */
  it('names shiki only inside a dynamic import, or as a type', () => {
    const offenders = globSync('**/*.{ts,tsx}', { cwd: UI_SRC })
      .map((rel) => ({ rel, text: readFileSync(join(UI_SRC, rel), 'utf8') }))
      .flatMap(({ rel, text }) =>
        [
          ...text.matchAll(
            /(?:^|\n)\s*(import|export)\s+(type\s+)?[A-Za-z0-9_$,{}\s*]*?\bfrom\s*['"](shiki[^'"]*)['"]/g,
          ),
        ]
          .filter((m) => !m[2])
          .map((m) => `${rel}: ${m[1]!} ... from '${m[3]!}'`),
      )
    expect(
      offenders.sort(),
      'a static value import of shiki bundles the barrel, and the deferred cost is no longer deferred',
    ).toEqual([])
  })
})

describe('the runs concatenate back to the source', () => {
  it.each([
    ['kql', 'SecurityEvent | where EventID == 4688 and Computer == "WKS-FIN01"'],
    ['powershell', 'Get-WmiObject -Class Win32_Process | Where-Object { $_.Name -eq "x.exe" }'],
    ['bash', 'curl -sSL https://example.invalid/a | sh   # two  spaces'],
    ['json', '{"user":"p.zero@meridian.example","count":3,"ok":true}'],
  ])('for %s', async (language, source) => {
    const lines = await highlightCode(source, language)
    expect(textOf(lines)).toBe(source)
    expect(lines).toHaveLength(1)
  })

  it('keeps a two thousand character line whole and on one line', async () => {
    const wide = `Write-Host "${'A'.repeat(2000)}"`
    const lines = await highlightCode(wide, 'powershell')
    expect(lines).toHaveLength(1)
    expect(textOf(lines)).toBe(wide)
  })

  it('keeps every character of source that looks like markup', async () => {
    const hostile = '<script>alert("x")</script> & <img src=x onerror=alert(1)>'
    const lines = await highlightCode(hostile, 'bash')
    expect(textOf(lines)).toBe(hostile)
    // No entity escaping and no unescaping: what goes in is what comes out,
    // as text. React puts it on the page as a text node.
    expect(textOf(lines)).not.toContain('&lt;')
    expect(textOf(lines)).not.toContain('&amp;')
  })

  it('keeps the source of a paste it refuses to highlight', async () => {
    const big = Array.from({ length: MAX_HIGHLIGHT_LINES + 5 }, (_, i) => `line ${String(i)}`).join('\n')
    const lines = await highlightCode(big, 'powershell')
    expect(textOf(lines)).toBe(big)
    expect(lines.every((line) => line.every((token) => token.color === undefined))).toBe(true)
  })
})

describe('the edges of a paste', () => {
  it('renders an empty string as one empty line', async () => {
    expect(toPlainLines('')).toEqual([[]])
    expect(await highlightCode('', 'powershell')).toEqual([[]])
  })

  it('keeps a trailing newline as a trailing empty line', () => {
    // Dropping it silently is how a block loses the blank line an analyst
    // pasted, and how a copied payload stops matching what was on screen.
    expect(toPlainLines('a\n')).toEqual([[{ content: 'a' }], []])
  })

  it.each([
    ['a\r\nb', 'a\nb'],
    ['a\rb', 'a\nb'],
    ['a\r\n\r\nb', 'a\n\nb'],
    ['a\nb', 'a\nb'],
  ])('normalises %j to %j', (given, expected) => {
    expect(normaliseCode(given)).toBe(expected)
  })

  it('splits a Windows paste into the lines it looks like', async () => {
    const lines = await highlightCode('Get-Process\r\nGet-Service', 'powershell')
    expect(lines).toHaveLength(2)
    expect(textOf(lines)).toBe('Get-Process\nGet-Service')
  })

  it('colours nothing when it falls back, so the caller cannot tell two failures apart', async () => {
    const plain = await highlightCode('Get-Process', 'plaintext')
    expect(plain).toEqual([[{ content: 'Get-Process' }]])
  })
})

describe('the line-number gutter', () => {
  /**
   * **jsdom cannot see the column, so the arithmetic is held here instead.**
   * A gutter sized per row rather than per block puts line 9 and line 10 a
   * character apart, and every instrument in this tier renders that green.
   * What this asserts is the width; whether the column lines up on screen is
   * `visual-check`'s.
   */
  it.each([
    [1, '2ch'],
    [9, '2ch'],
    [10, '3ch'],
    [99, '3ch'],
    [100, '4ch'],
    [2000, '5ch'],
    // An empty block still has one line, and a zero-wide gutter would collapse
    // the column the moment content arrived.
    [0, '2ch'],
  ])('reserves %i lines as %s', (lines, expected) => {
    expect(gutterWidth(lines)).toBe(expected)
  })
})

describe('every colour comes from the token layer', () => {
  /**
   * **Eight of the theme's fourteen non-ANSI properties are all four grammars
   * ever reach**, measured over representative samples: foreground, comment,
   * constant, function, keyword, punctuation, string, string-expression.
   */
  it('gives every run a var() reference and never a literal', async () => {
    const lines = await highlightCode(
      'Get-Process -Name "svchost" # a comment\n$count = 42',
      'powershell',
    )
    const colours = lines.flatMap((line) => line.map((token) => token.color)).filter(Boolean)
    expect(colours.length).toBeGreaterThan(3)
    for (const colour of colours) expect(colour).toMatch(/^var\(--code-[a-z-]+\)$/)
  })

  /**
   * **The contract with shiki, read out of shiki.**
   */
  it('declares every property shiki asks for, in every ground', async () => {
    const { createCssVariablesTheme } = await import('shiki/core')
    const theme = createCssVariablesTheme({ variablePrefix: '--code-', fontStyle: true }) as {
      colors?: Record<string, string>
    }
    const emitted = [...new Set([...JSON.stringify(theme).matchAll(/var\((--code-[a-z-]+)\)/g)].map((m) => m[1]!))]
    expect(emitted.length).toBeGreaterThan(20)

    const ansi = new Set(
      Object.entries(theme.colors ?? {})
        .filter(([key]) => key.startsWith('terminal.'))
        .map(([, value]) => value.replace(/^var\(|\)$/g, '')),
    )
    expect(ansi.size).toBe(16)

    const required = emitted.filter((name) => !ansi.has(name)).sort()
    expect(required.length).toBeGreaterThan(10)

    const grounds = [...TOKENS.matchAll(/\{([^}]*)\}/g)]
      .map((m) => m[1]!)
      .filter((block) => block.includes('color-scheme:'))
    expect(grounds).toHaveLength(3)

    const missing = grounds.flatMap((block, index) =>
      required.filter((name) => !new RegExp(`^\\s*${name}:`, 'm').test(block)).map((name) => `ground ${String(index)}: ${name}`),
    )
    expect(
      missing.sort(),
      'shiki emits these and the token layer declares none of them, so the run renders in the inherited colour',
    ).toEqual([])
  })
})
