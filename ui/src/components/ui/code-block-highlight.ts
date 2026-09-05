import type { ThemedToken } from 'shiki'

/**
 * One coloured run inside a line.
 */
export interface CodeToken {
  content: string
  color?: string
}

/** A line, as the runs it is made of. An empty line has no runs. */
export type CodeLine = CodeToken[]

/**
 * The four grammars this kit will load, and the maintainer set the list.
 */
const GRAMMARS: Record<string, () => Promise<unknown>> = {
  bash: () => import('shiki/langs/shellscript.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  kql: () => import('shiki/langs/kusto.mjs'),
  powershell: () => import('shiki/langs/powershell.mjs'),
}

/** Spellings that reach the same grammar. What a fence or a paste actually says. */
const ALIASES: Record<string, string> = {
  console: 'bash',
  jsonc: 'json',
  kusto: 'kql',
  ps: 'powershell',
  ps1: 'powershell',
  pwsh: 'powershell',
  sh: 'bash',
  shell: 'bash',
  shellscript: 'bash',
  zsh: 'bash',
}

/** Every grammar name a caller may pass, sorted. Aliases resolve onto these. */
export const CODE_LANGUAGES: readonly string[] = Object.keys(GRAMMARS).sort()

/**
 * The ceiling past which a paste renders as plain text.
 */
export const MAX_HIGHLIGHT_LINES = 2000
export const MAX_HIGHLIGHT_CHARS = 200_000

/** Resolves an alias, and answers `undefined` for anything not in the allowlist. */
export function resolveLanguage(language?: string): string | undefined {
  if (language === undefined) return undefined
  const normalised = language.trim().toLowerCase()
  const resolved = ALIASES[normalised] ?? normalised
  return resolved in GRAMMARS ? resolved : undefined
}

/** `\r\n` and a bare `\r` both become `\n`, so every offset downstream is LF-based. */
export function normaliseCode(code: string): string {
  return code.replace(/\r\n?/g, '\n')
}

/**
 * The lines, uncoloured. The first paint of every block, and the answer for an
 * unknown language, an oversized paste and a grammar that throws.
 */
export function toPlainLines(code: string): CodeLine[] {
  return normaliseCode(code)
    .split('\n')
    .map((text) => (text ? [{ content: text }] : []))
}

/**
 * Whether this input gets a grammar pass at all.
 */
export function isHighlightable(code: string, language?: string): boolean {
  if (resolveLanguage(language) === undefined) return false
  if (code.length > MAX_HIGHLIGHT_CHARS) return false
  let lines = 1
  let at = code.indexOf('\n')
  while (at !== -1) {
    lines += 1
    if (lines > MAX_HIGHLIGHT_LINES) return false
    at = code.indexOf('\n', at + 1)
  }
  return true
}

interface HighlighterLike {
  codeToTokens: (
    code: string,
    options: { lang: string; theme: string },
  ) => { tokens: ThemedToken[][] }
  loadLanguage: (grammar: unknown) => Promise<void>
  loadTheme: (theme: unknown) => Promise<void>
}

const THEME = 'css-variables'

let highlighterPromise: Promise<HighlighterLike> | null = null
const loaded = new Set<string>()

/**
 * One highlighter for the page, built on the JavaScript regex engine.
 */
async function loadHighlighter(): Promise<HighlighterLike> {
  highlighterPromise ??= (async () => {
    const [core, engine] = await Promise.all([
      import('shiki/core'),
      import('shiki/engine/javascript'),
    ])
    const highlighter = (await core.createHighlighterCore({
      themes: [],
      langs: [],
      engine: engine.createJavaScriptRegexEngine({ forgiving: true }),
    })) as unknown as HighlighterLike
    await highlighter.loadTheme(
      core.createCssVariablesTheme({ name: THEME, variablePrefix: '--code-', fontStyle: true }),
    )
    return highlighter
  })()
  return highlighterPromise
}

/**
 * A run, as colour and text.
 */
function toToken(token: ThemedToken): CodeToken {
  return {
    content: token.content,
    ...(token.color === undefined ? {} : { color: token.color }),
  }
}

/**
 * The coloured lines, or the plain ones when this input earns no grammar pass.
 */
export async function highlightCode(code: string, language?: string): Promise<CodeLine[]> {
  const source = normaliseCode(code)
  const grammar = resolveLanguage(language)
  if (grammar === undefined || !isHighlightable(source, grammar)) return toPlainLines(source)

  try {
    const highlighter = await loadHighlighter()
    const load = GRAMMARS[grammar]
    if (load === undefined) return toPlainLines(source)
    if (!loaded.has(grammar)) {
      await highlighter.loadLanguage(await load())
      loaded.add(grammar)
    }
    const { tokens } = highlighter.codeToTokens(source, { lang: grammar, theme: THEME })
    return tokens.map((line) => line.map(toToken))
  } catch {
    return toPlainLines(source)
  }
}

/**
 * How wide the line-number gutter has to be, in `ch`, for a block of `lines`.
 */
export function gutterWidth(lines: number): string {
  return `${String(String(Math.max(lines, 1)).length + 1)}ch`
}

/** Which grammars this page has actually fetched. The laziness claim, observable. */
export function loadedGrammars(): readonly string[] {
  return [...loaded].sort()
}

/** Test seam: drops the singleton and everything it had loaded. */
export function resetHighlighter(): void {
  highlighterPromise = null
  loaded.clear()
}
