import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The token layer's own tests: every value `tokens.css` declares must be
 * reachable from something that renders, or a component asking for it
 * silently falls back to Tailwind's built-in value instead.
 *
 * A source scan is the only instrument here. Compiling the stylesheet and
 * reading back computed values would need a browser, and the build produces
 * one file in which an unreached token and a reached one look identical.
 */

// `process.cwd()` rather than `import.meta.url`: Vitest transforms this file
// for jsdom, and the module URL it hands back is not a filesystem path there.
// Vitest's cwd is `ui/`, which is what `vite.config.ts` roots the run at.
const SRC = join(process.cwd(), 'src')
const STYLES = join(SRC, 'styles')
/**
 * The token layer, which is three files: what a value is, the colours that
 * answer to something outside this application, and what a colour means per
 * ground. Read together, because every rule below is about the layer rather
 * than about one of its files.
 */
const TOKENS = ['scale.css', 'standards.css', 'ground.css']
  .map((name) => readFileSync(join(STYLES, name), 'utf8'))
  .join('\n')
/** The republication, which is the only place a `--color-*` name is minted. */
const INDEX = readFileSync(join(STYLES, 'theme.css'), 'utf8')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(tsx?|css)$/.test(name) ? [path] : []
  })
}

/**
 * A file's code, with comments removed.
 *
 * A docstring reaches no browser, so a comment quoting a colour or a token
 * name reads exactly like a use of one to a raw text scan. The checks below
 * are about what ships, so they read code only.
 *
 * Crude on purpose: a comment opener inside a string literal is stripped too.
 * That can only ever *hide* a match, and the strings these tests care about are
 * class names and colours, neither of which contains one.
 */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/** Every source file's code, keyed by path, with comments stripped. */
const SOURCE = sourceFiles(SRC)
  .filter((path) => !path.endsWith('tokens.test.ts'))
  .map((path) => ({ path, text: code(readFileSync(path, 'utf8')) }))

const ALL_SOURCE = SOURCE.map(({ text }) => text).join('\n')

/** Every `--name:` declared in tokens.css. */
function declaredTokens(): string[] {
  return [...TOKENS.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((match) => match[1]!)
}

/**
 * Every `--color-*` the `@theme inline` block publishes, mapped to the token
 * it dereferences.
 *
 * A republication is a utility's whole definition, so a line pointing at a
 * name nothing declares is a class that compiles and paints nothing.
 */
function themeColours(): Map<string, string> {
  const block = /@theme inline\s*\{([\s\S]*?)\n\}/.exec(INDEX)
  if (!block) throw new Error('index.css has no `@theme inline` block')
  return new Map(
    [...block[1]!.matchAll(/^\s*--color-([a-z0-9-]+):\s*var\((--[a-z0-9-]+)\);/gm)].map((m) => [
      m[1]!,
      m[2]!,
    ]),
  )
}

/** Every `var(--name)` on the right-hand side of an `@theme inline` line. */
function republished(): Set<string> {
  const block = /@theme inline\s*\{([\s\S]*?)\n\}/.exec(INDEX)
  if (!block) throw new Error('index.css has no `@theme inline` block')
  return new Set(
    [...block[1]!.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((match) => match[1]!),
  )
}

/**
 * Every design language `tokens.css` declares, with both of its theme blocks.
 *
 * Read out of `tokens.css`, because a language is a `[data-language="..."]`
 * block there rather than a separate file - so the caller must assert the
 * result is non-empty rather than trust an empty list as "no languages yet".
 *
 * `color-scheme` is the discriminator for a colour block, because it is the
 * one declaration only a colour block carries: a language's geometry block
 * (radii, widths, timeline padding) has no theme axis and sets no ground.
 */
function languageBlocks(): { name: string; light: string; dark: string }[] {
  const css = TOKENS.replace(/\/\*[\s\S]*?\*\//g, '')
  /** The body of the block a selector opens, brace-matched. */
  const bodyOf = (selector: string): string => {
    // The selector must be followed by `{`, or `[data-language='console']`
    // matches its own `[data-theme='dark']` sibling and a language silently
    // reads one theme twice.
    const at = css.search(new RegExp(`${selector.replace(/[[\]'*+?.()|{}^$\\]/g, '\\$&')}\\s*\\{`))
    if (at === -1) throw new Error(`tokens.css declares no ${selector}`)
    const open = css.indexOf('{', at)
    let depth = 0
    for (let i = open; i < css.length; i += 1) {
      if (css[i] === '{') depth += 1
      else if (css[i] === '}') {
        depth -= 1
        if (depth === 0) return css.slice(open + 1, i)
      }
    }
    throw new Error(`${selector} is never closed`)
  }
  const names = [...new Set([...css.matchAll(/\[data-language='([^']+)'\]/g)].map((m) => m[1]!))]
  return names.map((name) => ({
    name,
    light: bodyOf(`[data-language='${name}']`),
    dark: bodyOf(`[data-language='${name}'][data-theme='dark']`),
  }))
}

/** Every `--name:` declared in a block. */
function declared(block: string): Set<string> {
  return new Set([...block.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((m) => m[1]!))
}

/**
 * `console`'s colour roles for one theme - the set every language owes.
 *
 * `oklch` is what separates a colour role from geometry in `tokens.css`, and
 * it also excludes every `var()` alias -- the shadcn slot names at the foot of
 * each block. A language may alias them the same way, so requiring them by
 * name would fail a file that had made no mistake.
 */
function consoleColourRoles(scheme: 'light' | 'dark'): Set<string> {
  const blocks = [...TOKENS.matchAll(/\{([^}]*)\}/g)].map((m) => m[1]!)
  const block = blocks.find((b) => b.includes(`color-scheme: ${scheme}`))!
  return new Set(
    [...block.matchAll(/^\s*(--[a-z0-9-]+):\s*oklch/gm)].map((m) => m[1]!),
  )
}

/**
 * The utility prefixes each theme namespace generates, so a token declared in
 * one can be looked for the way it is actually written.
 *
 * **A namespaced token is not read as `var()` anywhere.** `--spacing-control-md`
 * is spelled `h-control-md` at every call site, so a scan for the variable
 * finds nothing and reports a token the whole kit draws with as dead. The
 * shorthand below stays for the two kinds that have no namespace to live in --
 * a duration, and a value another rule sets per element.
 */
const NAMESPACE_UTILITIES: readonly (readonly [string, string])[] = [
  ['--spacing-', '(?:h|w|size|min-h|min-w|max-h|max-w|p|px|py|pt|pb|pl|pr|ps|pe|m|mx|my|mt|mb|ml|mr|ms|me|gap|gap-x|gap-y|top|bottom|left|right|inset|basis|scroll-p|scroll-pt|scroll-pb|translate-x|translate-y)'],
  ['--container-', '(?:max-w|min-w|w)'],
  ['--text-', 'text'],
  ['--radius-', 'rounded(?:-[a-z]{1,2})?'],
  ['--shadow-', 'shadow'],
  ['--leading-', 'leading'],
  ['--tracking-', 'tracking'],
  ['--font-weight-', 'font'],
  ['--font-', 'font'],
  ['--ease-', 'ease'],
  ['--color-', '(?:bg|text|border|border-[trblxyse]|ring|fill|stroke|outline|caret|accent|decoration|divide|from|via|to|shadow)'],
]

function usesToken(text: string, token: string): boolean {
  const shorthand = new RegExp(`[a-z-]+\\((${token})\\)|var\\(${token}\\)`)
  if (shorthand.test(text)) return true
  for (const [namespace, prefixes] of NAMESPACE_UTILITIES) {
    if (!token.startsWith(namespace)) continue
    const name = token.slice(namespace.length)
    // A negative utility keeps the name: `-mt-control-md`.
    if (new RegExp(`-?${prefixes}-${name}(?![a-z0-9-])`).test(text)) return true
  }
  return false
}


/** Whether anything in the tree draws with this token, however it is spelled. */
const reachableInSource = (token: string) => usesToken(ALL_SOURCE, token)

describe('the token layer', () => {
  /**
   * **Read by a library at runtime, and by nothing in this tree statically.**
   *
   * shiki's `css-variables` theme generates `var(--code-token-string)` and its
   * siblings into the tokens it hands back, so no file here ever names one --
   * and a source scan cannot see a string a dependency composes. The two
   * `--code-*` properties this app *does* name, `--code-background` and
   * `--code-foreground`, are not here: the block draws with them, so the check
   * reaches them like anything else.
   *
   * **Being unreachable does not make them unchecked.**
   * `components/ui/code-block-highlight.test.ts` builds the theme and asserts
   * every property it emits is declared in every ground -- which is the
   * stronger claim, because it goes red when *shiki* adds a role as well as
   * when the token layer drops one.
   */

  const READ_ONLY_AT_RUNTIME = new Set<string>([
    '--code-token-changed',
    '--code-token-comment',
    '--code-token-constant',
    '--code-token-deleted',
    '--code-token-function',
    '--code-token-inserted',
    '--code-token-keyword',
    '--code-token-link',
    '--code-token-parameter',
    '--code-token-punctuation',
    '--code-token-string',
    '--code-token-string-expression',
  ])

  /**
   * Tailwind's own configuration keys, which the framework reads and no file
   * here ever names.
   *
   * `--spacing` is the multiplier behind every numeric utility, so `p-4` reaches
   * it without spelling it; the two `--default-transition-*` are what a bare
   * `transition` resolves to. A scan for the name finds nothing because there is
   * nothing to find, and setting them is the documented way to retune the
   * framework rather than a token this project publishes.
   */
  const READ_BY_TAILWIND = new Set<string>([
    '--spacing',
    '--default-transition-duration',
    '--default-transition-timing-function',
  ])


  it('reaches every value it declares', () => {
    const reachable = republished()
    const unreachable = declaredTokens().filter(
      (token) =>
        !reachable.has(token) &&
        !READ_ONLY_AT_RUNTIME.has(token) &&
        !READ_BY_TAILWIND.has(token) &&
        !reachableInSource(token),
    )
    expect(unreachable).toEqual([])
  })

  it('excuses nothing the tree turns out to name after all', () => {
    // An excuse that stopped being true is a hole in the check above, and it
    // reads exactly like a token that is legitimately composed elsewhere.
    const named = [...READ_ONLY_AT_RUNTIME].filter(
      (token) => republished().has(token) || reachableInSource(token),
    )
    expect(named.sort(), 'these are named in the tree, so the check above can reach them').toEqual([])
  })

  it('excuses nothing that has stopped being declared', () => {
    const declared = new Set(declaredTokens())
    expect([...READ_ONLY_AT_RUNTIME].filter((token) => !declared.has(token)).sort()).toEqual([])
    expect([...READ_BY_TAILWIND].filter((token) => !declared.has(token)).sort()).toEqual([])
  })

  it('gives the reading surfaces their type from the scale', () => {
    /**
     * **A design language retuning type has to move the document as well as the
     * chrome.** `prose.css` styles a DOM this tree does not own -- ProseMirror's,
     * and the export preview -- so it is written as custom CSS rather than
     * utilities, and it held its own literals: `1.05rem`, `650`, `1.72`. Every
     * one was outside the scale, so a language could restyle the whole
     * interface and leave the editor an analyst writes into exactly as it was.
     *
     * Tailwind's own guidance for this shape is a component-layer rule reading
     * theme variables -- `var(--font-weight-semibold)` rather than `600` -- which
     * is what this holds it to.
     *
     * A ratio in `em` is deliberately allowed: code sits relative to the
     * paragraph around it rather than at a step of its own.
     */
    const prose = readFileSync(join(STYLES, 'prose.css'), 'utf8')

    const weights = [...prose.matchAll(/font-weight:\s*([^;]+);/g)].map((m) => m[1]!.trim())
    expect(weights.length).toBeGreaterThan(3)
    expect(weights.filter((value) => !value.startsWith('var('))).toEqual([])

    const sizes = [...prose.matchAll(/font-size:\s*([^;]+);/g)].map((m) => m[1]!.trim())
    expect(sizes.length).toBeGreaterThan(3)
    // The collaboration caret's label is a floating badge naming another
    // analyst, not reading type, and its size is no step of the scale.
    expect(sizes.filter((value) => value.endsWith('rem'))).toEqual(['0.68rem'])

    const leadings = [...prose.matchAll(/line-height:\s*([^;]+);/g)].map((m) => m[1]!.trim())
    // `1` is that badge again: one line.
    expect(leadings.filter((v) => !v.startsWith('var(') && v !== '1')).toEqual([])
  })

  it('republishes colours and nothing else', () => {
    /**
     * **The bridge exists only because `@theme` holds no second selector and no
     * media query.** That is true of a colour role, which is declared once per
     * ground, and of nothing else: a measure, a face, a weight, a shadow and the
     * fixed TLP and paper hexes are the same in both grounds, so each is
     * declared once in its own namespace and needs no line here.
     *
     * A non-colour line reappearing in this file is the two-names-per-value
     * shape coming back, and with it the variable-shorthand call sites that
     * shape forces. The scale carried thirty-two such lines before they moved.
     *
     * **The shorthand is not written out here on purpose.** Tailwind's scanner
     * reads comments as readily as markup, so spelling the class in prose is
     * enough to generate it -- and this one names a token that no longer
     * exists, so it generated a rule resolving to nothing. Measured in the
     * served stylesheet, where it survived a cache clear and a restart.
     */
    const block = /@theme inline\s*\{([\s\S]*?)\n\}/.exec(INDEX)![1]!
    const names = [...block.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((m) => m[1]!)
    expect(names.length).toBeGreaterThan(30)
    expect(names.filter((name) => !name.startsWith('--color-'))).toEqual([])
  })

  it('republishes nothing that points at a token it does not declare', () => {
    /**
     * A republication is where a utility gets its definition, and Tailwind
     * emits the rule whether or not the token exists - so the failure is a
     * class that is present on the element, present in the stylesheet, and
     * paints nothing. Neither suite can see it: jsdom has no CSS.
     */
    const declared = new Set(declaredTokens())
    const dangling = [...themeColours()]
      .filter(([, points]) => !declared.has(points))
      .map(([name, points]) => `--color-${name} -> ${points}`)
    expect(dangling).toEqual([])
  })

  it('declares no measure twice under an axis pair', () => {
    /**
     * A left and right edge that share a value could be a deliberate pair or
     * a retune that only moved one side and left the other looking
     * deliberate. One `-x` measure cannot disagree with itself.
     *
     * The pair, not the value: two unrelated tokens sharing a value (a corner
     * radius and a type size) is not a defect. What makes this a duplicate is
     * that the two names differ only by the axis they apply the same measure
     * to.
     */
    const declared = Object.fromEntries(
      [...TOKENS.matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gm)].map((m) => [m[1]!, m[2]!.trim()]),
    )
    const pairs = Object.keys(declared)
      .filter((name) => name.endsWith('-l'))
      .map((left) => ({ left, right: `${left.slice(0, -2)}-r` }))
      .filter(({ left, right }) => declared[right] !== undefined && declared[right] === declared[left])
    expect(pairs).toEqual([])
  })

  it('declares no measure that only one file reads', () => {
    /**
     * The token file is shared vocabulary: a width or a height serving one
     * component is that component's own detail, and putting it here costs
     * every reader of the file a value they will never meet again.
     *
     * Counted through `usesToken`, which knows both spellings a measure has:
     * the utility its namespace generates (`h-control-md`) and the shorthand
     * kept by the two kinds that have no namespace -- a duration, and a value
     * another rule sets per element.
     *
     * **One file is the floor.** The floor was two while every control had a
     * twin read alongside it, which this cannot tell from two unrelated
     * callers. There is one implementation per component now, so
     * a single caller is the ordinary case and what this catches is the token
     * that serves nothing at all.
     */
    // The four files that *declare*. `prose.css` and `base.css` live beside
    // them and read them like any component does, so a token they draw with is
    // read rather than orphaned -- which is what the reading surfaces' own type
    // steps are.
    const DECLARING = ['scale.css', 'standards.css', 'ground.css', 'theme.css']
    const isTokenLayer = (path: string) => DECLARING.some((name) => path.endsWith(name))
    const declared = [...TOKENS.matchAll(/\{([^}]*)\}/g)]
      .map((m) => m[1]!)
      .filter((b) => !b.includes('color-scheme:'))
      .flatMap((b) => [...b.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((m) => m[1]!))
    const shorthand = [...new Set(declared)].filter(
      (token) => !republished().has(token) && !READ_BY_TAILWIND.has(token),
    )
    expect(shorthand.length).toBeGreaterThan(5)
    const lonely = shorthand
      .map((token) => ({
        token,
        readers: SOURCE.filter(
          ({ path, text }) => !isTokenLayer(path) && usesToken(text, token),
        ).length,
      }))
      .filter(({ readers }) => readers < 1)
    expect(lonely).toEqual([])
  })

  it('declares the same role in both themes', () => {
    // A role present in light and missing in dark renders as the light value
    // on a dark ground - the failure mode a contrast check catches and a
    // snapshot does not.
    const light = consoleColourRoles('light')
    const dark = consoleColourRoles('dark')
    expect([...light].filter((role) => !dark.has(role))).toEqual([])
    expect([...dark].filter((role) => !light.has(role))).toEqual([])
  })

  it('writes every colour role in oklch, which is what makes the two tests above work', () => {
    /**
     * **A role written in hex disappears from its own requirement.**
     * `consoleColourRoles` keys on `oklch`, so `--card: #ffffff` in *one*
     * ground is caught by the test above as an asymmetry - and the same value
     * in *both* passes everything while dropping the role out of the set every
     * language owes. Measured: writing `--card` as hex in both grounds left
     * all fourteen tests green.
     *
     * A `var()` alias is not a spelling of a colour and is deliberately not
     * required to be one: it points at the page's own roles, which is the
     * language saying *the same*, not saying nothing.
     */
    const blocks = [...TOKENS.matchAll(/\{([^}]*)\}/g)]
      .map((m) => m[1]!)
      .filter((b) => b.includes('color-scheme:'))
    expect(blocks.length).toBeGreaterThan(1)
    const wrong = blocks.flatMap((b) =>
      [...b.matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gm)]
        .filter(([, , value]) => !/^(oklch\(|var\()/.test(value!.trim()))
        .map(([, name, value]) => `${name!}: ${value!.trim()}`),
    )
    expect(wrong).toEqual([])
  })

  it('keeps the colours that answer to no ground out of the role spelling', () => {
    /**
     * TLP is FIRST.org's published standard and `--paper-*` is a printed page,
     * so both sit outside the theme blocks: a design language that retuned
     * TLP:AMBER would be marking a document something else, and paper is white
     * in a dark app because paper is white.
     *
     * Hex is what says so: an `oklch` outside a ground reads as a role that
     * forgot to declare one, since there is no ground here to measure it
     * against.
     */
    const outside = [...TOKENS.matchAll(/\{([^}]*)\}/g)]
      .map((m) => m[1]!)
      .filter((b) => !b.includes('color-scheme:'))
    const roleSpelled = outside.flatMap((b) =>
      [...b.matchAll(/^\s*(--[a-z0-9-]+):\s*oklch/gm)].map((m) => m[1]!),
    )
    expect(roleSpelled).toEqual([])
    // And the families it is protecting are still there to protect, or the
    // assertion above is passing over an empty file.
    for (const token of ['--color-tlp-clear', '--color-paper', '--color-tlp-amber', '--color-paper-accent']) {
      expect(TOKENS).toContain(`${token}: #`)
    }
  })

  it('lets no block redeclare a colour that answers to no ground', () => {
    /**
     * The rule above is a notation check, and a language can walk past it: it
     * refuses an `oklch` *outside* a ground block, so `--color-paper: #f5f5f5` goes
     * red, but `--color-paper: oklch(0.97 0 0)` inside a language's own colour
     * block satisfies every check in the tree - there it reads as a role
     * written the way a role must be written.
     *
     * The property actually wanted has nothing to do with notation: these
     * roles have no theme axis, so one declaration each, in the whole file. A
     * second is a language retuning a document that has no theme to consult.
     */
    const named = [...TOKENS.matchAll(/^\s*(--color-(?:paper|tlp)[a-z0-9-]*):/gm)].map((m) => m[1]!)
    expect(new Set(named).size).toBeGreaterThan(10)
    const counts = new Map<string, number>()
    for (const name of named) counts.set(name, (counts.get(name) ?? 0) + 1)
    expect(
      [...counts].filter(([, n]) => n > 1).map(([name, n]) => `${name} x${String(n)}`).sort(),
      'a document has no theme to consult, so these are declared once and never per ground',
    ).toEqual([])
  })

  it('keeps the presence hues clear of every role that carries meaning', () => {
    /**
     * Presence is chrome placed in the gaps the app has left, and the
     * separation is what stops a presence disc reading as a severity.
     *
     * **25 degrees is the floor**, the measured minimum: `--presence-2` at
     * 329 against `--action-investigate`, which sits at 297 on light and 304
     * on dark.
     *
     * **Chroma below 0.05 is not a hue.** Every neutral in this file is
     * written at hue 260 with a chroma of 0.002 to 0.03, and counting those
     * would put a "role" 64 degrees from `--presence-2` that nobody can see
     * the colour of.
     */
    const SEPARATION = 25
    const CHROMATIC = 0.05
    for (const scheme of ['light', 'dark'] as const) {
      const blocks = [...TOKENS.matchAll(/\{([^}]*)\}/g)].map((m) => m[1]!)
      const block = blocks.find((b) => b.includes(`color-scheme: ${scheme}`))!
      const hues = [...block.matchAll(/^\s*(--[a-z0-9-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)/gm)]
        .map((m) => ({ name: m[1]!, chroma: Number(m[3]), hue: Number(m[4]) }))
        .filter(({ chroma }) => chroma >= CHROMATIC)
      const presence = hues.filter(({ name }) => name.startsWith('--presence-'))
      const rest = hues.filter(({ name }) => !name.startsWith('--presence-'))
      expect(presence.length, scheme).toBe(3)
      expect(rest.length, scheme).toBeGreaterThan(6)
      const apart = (a: number, b: number) => {
        const d = Math.abs(a - b) % 360
        return d > 180 ? 360 - d : d
      }
      const tooClose = presence.flatMap((disc) =>
        rest
          .filter((role) => apart(disc.hue, role.hue) < SEPARATION)
          .map((role) => `${scheme}: ${disc.name} (${String(disc.hue)}) is ${String(apart(disc.hue, role.hue))} from ${role.name} (${String(role.hue)})`),
      )
      expect(
        tooClose.sort(),
        'a presence disc this close to a role that carries meaning reads as that role',
      ).toEqual([])
    }
  })

  it('has every language declare every colour role, in both themes', () => {
    /**
     * The same failure as the test above, one file across: a role `tokens.css`
     * declares and a language omits falls through to `console`'s value, so a
     * warm-neutral language paints one cool chip and nothing says so.
     *
     * The test above keys its regex on `oklch`, and every language file is
     * written in hex - so it is structurally incapable of catching this one.
     * The *required* set still comes from `console`'s oklch declarations,
     * because that regex is what separates a colour role from geometry in
     * `tokens.css`. What a language declares is matched by name only: its
     * values are hex, rgba and `calc()`.
     */
    // The enumeration itself is asserted: an empty list makes every check
    // below pass while reading nothing.
    const languages = languageBlocks()
    expect(
      languages.map((l) => l.name).sort(),
      'tokens.css declares no design language, so the check below reads nothing',
    ).not.toEqual([])
    for (const { name, light, dark } of languages) {
      expect(declared(light).size, `${name} declares no light roles`).toBeGreaterThan(30)
      expect(declared(dark).size, `${name} declares no dark roles`).toBeGreaterThan(30)
    }

    const required = [...consoleColourRoles('light')].sort()
    // **What this catches that its siblings do not, measured rather than
    // claimed.** Deleting a role from `console`'s dark block reddens this
    // *and* `declares the same role in both themes` -- with one language the
    // two almost entirely overlap, and this one is the weaker of the pair.
    // What only this catches is the enumeration going empty: renaming the
    // selector to `[data-lang=]` reddens this alone. Its value against a real
    // omission arrives with the second language, and the assertion above is
    // what guarantees it will be running by then rather than reading nothing.
    const missing = languages.flatMap(({ name, light, dark }) => {
      const inLight = declared(light)
      const inDark = declared(dark)
      return [
        ...required.filter((role) => !inLight.has(role)).map((r) => `${name} light ${r}`),
        ...required.filter((role) => !inDark.has(role)).map((r) => `${name} dark ${r}`),
      ]
    })
    expect(missing).toEqual([])
  })
})

/**
 * A `<stop>` painting pure black or white.
 *
 * **In a `<mask>` those are luminance, not colour** - black hides, white shows -
 * so no token can serve them and substituting one changes the mask's opacity
 * ramp. `mark.tsx`'s fade gradient is four such stops and is masked, never
 * painted.
 *
 * The gap this leaves, named rather than discovered later: a *visible* gradient
 * hardcoded in black or white passes. Nothing else in the scan can tell a mask
 * from a fill without parsing the SVG.
 */
const MASK_STOP = /stopColor=["'](#000{1,3}|#fff{1,3}|#000000|#ffffff)["']/g

/**
 * `rgba(0, 0, 0, 0)` is not a colour anybody paints with.
 *
 * It is what `getComputedStyle` returns for *no* background, so a story
 * asserting that a surface draws none writes it verbatim -- `surface='bare'`
 * on the canvas is the case. Masking it keeps the rule aimed at paint rather
 * than at the browser's word for its absence.
 */
const TRANSPARENT = /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/g

/**
 * Every `rounded-[...]` whose bracket names a measure rather than reading one.
 *
 * A radius is a design language's signature - `--radius-sm` is what a
 * competing language tightens - so a literal in a component is a corner that
 * language cannot reach.
 *
 * `var()` anywhere in the bracket passes: `min(var(--radius-md),10px)` and
 * `calc(var(--radius)-3px)` are the token clamped or stepped, which is a
 * component deriving from the scale rather than replacing it. So does a
 * CSS-wide keyword - `inherit` resolves to whatever the parent already took
 * from the layer.
 */
function arbitraryRadii(text: string): string[] {
  const CSS_WIDE = new Set(['inherit', 'initial', 'revert', 'revert-layer', 'unset'])
  return [...text.matchAll(/\brounded(?:-[a-z]+)*-\[([^\]]*)\]/g)]
    .map((match) => match[1]!)
    .filter((value) => !value.includes('var(') && !CSS_WIDE.has(value.trim()))
}

/**
 * Any colour written as a value rather than taken from the token layer.
 *
 * **A function form counts only when its first argument is a number.**
 * `lib/tokenColour.ts` builds `rgb(${r}, ${g}, ${b})` from channels it read
 * back off a token, which is the opposite of hardcoding one - and the file
 * exists because Cytoscape's parser predates `oklch()`. A hex is unconditional,
 * so that file writing `#fff` is still caught.
 */
const LITERAL_COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch)\(\s*[\d.]/

/**
 * `RootError.tsx` is the one file allowed to paint its own colours.
 *
 * It renders when the app itself has stopped rendering, so it may not reach the
 * component library - and the token layer arrives through a stylesheet the
 * failing tree is what loaded. Its own docstring makes the same argument for
 * importing nothing.
 *
 * **By path, and only this path.** The reason is the boundary's position above
 * everything, not the directory it sits in, so a second file under `app/` is
 * caught.
 */
const PAINTS_ITS_OWN = [
  join(SRC, 'app', 'RootError.tsx'),
  // The portraits are `data:image/svg+xml` URIs. An `<img>` loads in its own
  // document and inherits none of this page's custom properties, so a token
  // reaches nothing there - the alternative is a story that fetches, and a
  // story may not reach the network.
  join(SRC, 'components', 'ui', 'avatar.stories.tsx'),
  // Microsoft's four squares. A brand mark is the same four colours on every
  // ground and in every theme; a themed one is a different company's logo.
  join(SRC, 'components', 'blocks', 'sso-sign-in.tsx'),
]

/**
 * A hex that is *content* rather than paint.
 *
 * The server serves colour: `kind: 'color'` is a field an analyst fills, and
 * every timeline form ships a `colourMap` of hex under `drivesColour`. A
 * fixture carrying one is quoting the wire, not choosing a colour, and a rule
 * about the token layer has no business there.
 *
 * **The better shape is to read it from the served spec rather than type it**,
 * which is what `field-control.stories.tsx` should do -- its `#b91c1c` is
 * `EVENT_FIELDS`' own `critical`. Left as an exemption rather than rewritten
 * in a commit about a test.
 */
const COLOUR_IS_DATA = [join(SRC, 'components', 'blocks', 'field-control.stories.tsx')]

describe('no component carries a visual value', () => {
  // **The rule is about what this project writes**: a shadow or a duration
  // typed into a component is a visual decision escaping the token layer.
  // Every component here is now this project's own, so there is nothing to
  // exempt -- the vendored tier this used to carve out is gone.
  const components = sourceFiles(join(SRC, 'components'))
    .concat(sourceFiles(join(SRC, 'app')))
    .concat(sourceFiles(join(SRC, 'lib')))
    .concat(sourceFiles(join(SRC, 'screens')))
    .map((path) => ({ path, raw: readFileSync(path, 'utf8') }))
    .map(({ path, raw }) => ({ path, text: code(raw) }))

  it('still scans our own components, which is what the exclusion could break', () => {
    // The guard on the exclusion: a wrong separator or an over-broad match
    // would empty the scan, and an empty scan passes every assertion below.
    expect(components.some(({ path }) => path.includes(`${sep}components${sep}ui${sep}`))).toBe(true)
  })


  it('reads the directories that ship a colour', () => {
    // The guard on the guard: two directories were missing and the scan was
    // green, which is exactly what a scan over nothing looks like.
    for (const dir of ['/components/', '/app/', '/lib/']) {
      expect(components.some(({ path }) => path.includes(dir)), dir).toBe(true)
    }
    // And the one exemption still names a file that is read, so moving the
    // boundary cannot leave a live-looking exemption over nothing.
    for (const exempt of [...PAINTS_ITS_OWN, ...COLOUR_IS_DATA]) {
      expect(components.some(({ path }) => path === exempt), exempt).toBe(true)
    }
  })

  it('catches a colour written as a value', () => {
    // `RootError.tsx`'s own three, as fixtures rather than as a live read: the
    // file is exempt, so nothing else here proves the pattern still fires.
    expect(LITERAL_COLOUR.test("color: '#666'")).toBe(true)
    expect(LITERAL_COLOUR.test("background: '#f5f5f5'")).toBe(true)
    expect(LITERAL_COLOUR.test("color: '#900'")).toBe(true)
    expect(LITERAL_COLOUR.test("className='text-ink-muted'")).toBe(false)
  })

  it('uses no literal colour', () => {
    const offenders = components
      .filter(({ path }) => !PAINTS_ITS_OWN.includes(path) && !COLOUR_IS_DATA.includes(path))
      .filter(({ text }) => LITERAL_COLOUR.test(text.replace(MASK_STOP, '').replace(TRANSPARENT, '')))
    expect(offenders.map((o) => o.path)).toEqual([])
  })

  it('uses no arbitrary shadow, duration or easing', () => {
    // `duration-150` is Tailwind's own scale, not ours - the utility resolves
    // outside the token set and the token goes unread.
    const offenders = components.filter(({ text }) =>
      /\b(shadow|duration|ease)-\[|\bduration-\d/.test(text),
    )
    expect(offenders.map((o) => o.path)).toEqual([])
  })

  it('catches an arbitrary radius that reads no token', () => {
    // The fixtures are the four the rule was written against, as literals
    // rather than as a live read: once the tree is clean nothing else here
    // proves the predicate still fires.
    expect(arbitraryRadii('rounded-[7px]')).toEqual(['7px'])
    expect(arbitraryRadii('rounded-[1px]')).toEqual(['1px'])
    expect(arbitraryRadii('rounded-[min(var(--radius-md),10px)]')).toEqual([])
    expect(arbitraryRadii('rounded-[calc(var(--radius)-3px)]')).toEqual([])
    // A CSS-wide keyword takes whatever the parent resolved the token to, so
    // it names no measure of its own.
    expect(arbitraryRadii('rounded-[inherit]')).toEqual([])
    // A side, a corner and a variant all still reach the utility.
    expect(arbitraryRadii('before:rounded-tl-[2px]')).toEqual(['2px'])
    // And the named scale is what this is pushing work towards.
    expect(arbitraryRadii('rounded-lg rounded-full')).toEqual([])
  })

  it('uses no arbitrary radius', () => {
    const offenders = components.filter(({ text }) => arbitraryRadii(text).length > 0)
    expect(offenders.map((o) => o.path)).toEqual([])
  })

  it('uses only shadows the token layer defines', () => {
    const allowed = new Set(['sm', 'md', 'lg', 'none'])
    const used = components.flatMap(({ text }) =>
      [...text.matchAll(/\bshadow-([a-z]+)\b/g)].map((m) => m[1]!),
    )
    expect(used.filter((name) => !allowed.has(name))).toEqual([])
  })
})

/**
 * The nine role names shadcn spelled by its own slot, and what this project
 * calls them.
 *
 * The old spelling names the *slot a value was made for* rather than the job
 * it does, and one of them was measurably wrong about its own job:
 * `text-muted-foreground` is secondary ink on the page ground in the
 * overwhelming majority of its uses, not ink on `bg-muted`.
 */
const RETIRED_ROLES: Record<string, string> = {
  foreground: 'ink',
  'muted-foreground': 'ink-muted',
  'primary-foreground': 'on-primary',
  'destructive-foreground': 'on-destructive',
  'severity-foreground': 'on-severity',
  'severity-low-foreground': 'on-severity-low',
  'presence-foreground': 'on-presence',
  'accent-foreground': 'on-accent',
  'secondary-foreground': 'on-secondary',
}

/** Every `-foreground` colour name a body of text reads, split by how it reads it. */
function foregroundNames(text: string): { utility: string[]; variable: string[] } {
  return {
    // `text-sidebar-accent-foreground` -> `sidebar-accent-foreground`: the
    // first segment is the utility, everything after it is the colour name.
    utility: [
      ...text.matchAll(/(?<![a-zA-Z0-9-])[a-z]+-([a-z][a-z-]*foreground)(?![a-zA-Z0-9-])/g),
    ].map((m) => m[1]!),
    variable: [...text.matchAll(/var\(--([a-z][a-z-]*foreground)\)/g)].map((m) => m[1]!),
  }
}

describe('the retired shadcn spellings', () => {
  /**
   * **The ratchet.** The rename is only worth doing if it stays done, and the
   * old spelling is what every shadcn snippet, every registry component and
   * every model's habit will type next. A name that comes back reads as
   * correct at the call site and quietly re-splits the vocabulary.
   *
   * Scoped past `styles/`, which is where the retired names survive as
   * aliases by design.
   */
  const ours = SOURCE.filter(({ path }) => !path.includes(`${sep}styles${sep}`))

  it('scans our own tiers, which is what a wrong exclusion would empty', () => {
    for (const dir of ['components', 'screens', 'app']) {
      expect(ours.some(({ path }) => path.includes(`${sep}${dir}${sep}`)), dir).toBe(true)
    }
  })

  it('appears nowhere this project writes', () => {
    const offenders = ours.flatMap(({ path, text }) => {
      const { utility, variable } = foregroundNames(text)
      return [...utility, ...variable]
        .filter((name) => RETIRED_ROLES[name] !== undefined)
        .map((name) => `${path}: ${name} -> ${RETIRED_ROLES[name]!}`)
    })
    expect([...new Set(offenders)].sort()).toEqual([])
  })

  it('survives in the style layer as an alias and nothing more', () => {
    /**
     * An alias that grew a value of its own is the failure this catches: the
     * old name and the new one would then be two roles a design language has
     * to tune separately, and only one of them is documented.
     *
     * Three declarations each, because a role is declared in the light block,
     * the explicit dark block and the `prefers-color-scheme` fallback --
     * `languages.rule.test.ts` holds the last two equal to each other.
     */
    for (const [old, replacement] of Object.entries(RETIRED_ROLES)) {
      const declarations = [...TOKENS.matchAll(new RegExp(`^\\s*--${old}:\\s*([^;]+);`, 'gm'))].map(
        (m) => m[1]!.trim(),
      )
      if (declarations.length === 0) continue // dropped outright; the tier no longer reads it
      expect(declarations, `--${old} is declared unevenly across the theme blocks`).toEqual([
        `var(--${replacement})`,
        `var(--${replacement})`,
        `var(--${replacement})`,
      ])
    }
  })

  it('names a replacement that the token layer actually declares', () => {
    // The map itself, held against the file: a typo here would excuse the
    // exact call site the ratchet exists to catch.
    const declared = new Set(declaredTokens())
    expect(
      Object.values(RETIRED_ROLES).filter((name) => !declared.has(`--${name}`)),
    ).toEqual([])
  })
})
