import type { ThemedToken } from 'shiki'

/**
 * One coloured run inside a line. `color` is always a `var(--code-token-*)`
 * reference, never a literal: the theme is shiki's `css-variables` one at the
 * `--code-` prefix, so the palette lives in `tokens.css` and follows the ground.
 */
export interface CodeToken {
  content: string
  color?: string
}

/** A line, as the runs it is made of. An empty line has no runs. */
export type CodeLine = CodeToken[]

/**
 * The four grammars this kit will load, and the maintainer set the list.
 *
 * `kql` is the reason the component exists: a saved Kusto query is how a
 * finding was obtained, and this product already imports from Sentinel.
 * `powershell` and `bash` are what an actor ran and what collected the
 * evidence; `json` is what an importer and an export carry. Everything else is
 * plain text, which is a readable answer rather than a failure.
 *
 * **The key is the name a caller passes and shiki's own id is what the file
 * holds** -- `kql` is shiki's `kusto` and `bash` is its `shellscript`. Loading
 * a grammar registers its aliases too, so both spellings tokenise once loaded.
 *
 * Every entry is a hardcoded dynamic `import()`, never
 * ``import(`shiki/langs/${lang}.mjs`)``: a template specifier makes the bundler
 * emit all ~200 grammars as one chunk, which is the whole cost argument gone.
 *
 * Adding one is a line here and a story beside it, and it is not free: each
 * grammar is a few kilobytes gzipped in a chunk somebody's browser fetches.
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
 *
 * Tokenising is synchronous once the grammar is in, so a big paste is a frozen
 * tab rather than a slow one. Two thousand is the last power-of-ten step that
 * stays inside a quarter second on the JavaScript regex engine.
 *
 * The character bound is the other axis: 2,000 lines of minified JSON is one
 * line as far as the line count is concerned.
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
 *
 * Exported because the answer decides what a caller renders, and a test that
 * has to infer it from the output is testing the renderer instead.
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
 *
 * Oniguruma is the alternative and it is WebAssembly, which would put
 * `'wasm-unsafe-eval'` in this app's content security policy for a code
 * viewer. `forgiving` keeps a pattern the JavaScript engine cannot express
 * from taking the block down.
 *
 * Both imports are dynamic, and so is every grammar: nothing shiki ships
 * reaches the initial bundle until something is actually highlighted.
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
 *
 * **`fontStyle` is dropped, and it is dropped on a measurement.** The theme
 * carries italic, bold and underline, and across representative samples of all
 * four grammars -- comments, here-strings, interpolation, links, block
 * comments -- shiki sets the flag on no run at all. Every scope that would
 * carry one belongs to markdown, which is not in the allowlist. Mapping the
 * three bits is code no test can reach and no screen can show; a fifth grammar
 * that needs them brings them back with it.
 */
function toToken(token: ThemedToken): CodeToken {
  return {
    content: token.content,
    ...(token.color === undefined ? {} : { color: token.color }),
  }
}

/**
 * The coloured lines, or the plain ones when this input earns no grammar pass.
 *
 * Never throws: an unloadable grammar, an unexpected shiki shape or a pattern
 * the engine refuses all end as plain text, because a code viewer that takes
 * the screen down is worse than one that shows no colour.
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
 *
 * A function rather than an expression at the call site because it is the one
 * decision in the gutter a test can hold: jsdom gives every element a zero box,
 * so a gutter that sizes itself per row -- putting line 9 and line 10 a
 * character apart -- renders wrong and asserts green. This is the arithmetic
 * on its own; whether the column actually lines up is `visual-check`'s.
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
