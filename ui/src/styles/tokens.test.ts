import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The token layer's own tests: every value `tokens.css` declares must be
 * reachable from something that renders, or a component asking for it
 * silently falls back to Tailwind's built-in value instead.
 */

// `process.cwd()` rather than `import.meta.url`: Vitest transforms this file
// for jsdom, and the module URL it hands back is not a filesystem path there.
// Vitest's cwd is `ui/`, which is what `vite.config.ts` roots the run at.
const SRC = join(process.cwd(), 'src')
const STYLES = join(SRC, 'styles')
const TOKENS = readFileSync(join(STYLES, 'tokens.css'), 'utf8')
const INDEX = readFileSync(join(STYLES, 'index.css'), 'utf8')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(tsx?|css)$/.test(name) ? [path] : []
  })
}

/**
 * A file's code, with comments removed.
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
 */
function consoleColourRoles(scheme: 'light' | 'dark'): Set<string> {
  const blocks = [...TOKENS.matchAll(/\{([^}]*)\}/g)].map((m) => m[1]!)
  const block = blocks.find((b) => b.includes(`color-scheme: ${scheme}`))!
  return new Set(
    [...block.matchAll(/^\s*(--[a-z0-9-]+):\s*oklch/gm)].map((m) => m[1]!),
  )
}

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

  const reachableInSource = (token: string) => {
    // Tailwind 4 has no height or width theme namespace, so these are
    // consumed with the variable shorthand - `h-(--control-h-md)` - instead.
    const shorthand = new RegExp(`[a-z-]+\\((${token})\\)|var\\(${token}\\)`)
    return shorthand.test(ALL_SOURCE)
  }

  it('reaches every value it declares', () => {
    const reachable = republished()
    const unreachable = declaredTokens().filter(
      (token) => !reachable.has(token) && !READ_ONLY_AT_RUNTIME.has(token) && !reachableInSource(token),
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
  })

  it('uses every spacing utility it republishes', () => {
    /**
     * A `@theme inline` line makes `--spacing-timeline-chip-x` into the
     * utility `px-timeline-chip-x`, and the reachability test above then
     * counts the token as reached by the republication rather than by
     * anything drawing with it - so this checks the utility itself has a
     * caller.
     */
    const block = /@theme inline\s*\{([\s\S]*?)\n\}/.exec(INDEX)![1]!
    const suffixes = [...block.matchAll(/^\s*--spacing-([a-z0-9-]+):/gm)].map((m) => m[1]!)
    expect(suffixes.length).toBeGreaterThan(0)
    const unused = suffixes.filter(
      (suffix) => !SOURCE.some(({ path, text }) => !path.includes(`${sep}styles${sep}`) && text.includes(`-${suffix}`)),
    )
    expect(unused).toEqual([])
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
     * A left and right edge that share a value could be a deliberate pair or a
     * retune that only moved one side and left the other looking deliberate.
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
     */
    const isTokenLayer = (path: string) =>
      path.endsWith(`${sep}tokens.css`) || path.endsWith(`${sep}index.css`)
    const declared = [...TOKENS.matchAll(/\{([^}]*)\}/g)]
      .map((m) => m[1]!)
      .filter((b) => !b.includes('color-scheme:'))
      .flatMap((b) => [...b.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((m) => m[1]!))
    const shorthand = [...new Set(declared)].filter((token) => !republished().has(token))
    expect(shorthand.length).toBeGreaterThan(5)
    const lonely = shorthand
      .map((token) => ({
        token,
        readers: SOURCE.filter(
          ({ path, text }) => !isTokenLayer(path) && text.includes(`(${token})`),
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
    for (const token of ['--tlp-clear', '--paper', '--tlp-amber', '--paper-accent']) {
      expect(TOKENS).toContain(`${token}: #`)
    }
  })

  it('lets no block redeclare a colour that answers to no ground', () => {
    /**
     * The rule above is a notation check, and a language can walk past it: it
     * refuses an `oklch` *outside* a ground block, so `--paper: #f5f5f5` goes
     * red, but `--paper: oklch(0.97 0 0)` inside a language's own colour
     * block satisfies every check in the tree - there it reads as a role
     * written the way a role must be written.
     */
    const named = [...TOKENS.matchAll(/^\s*(--(?:paper|tlp)[a-z0-9-]*):/gm)].map((m) => m[1]!)
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
 */
const MASK_STOP = /stopColor=["'](#000{1,3}|#fff{1,3}|#000000|#ffffff)["']/g

/**
 * `rgba(0, 0, 0, 0)` is not a colour anybody paints with.
 */
const TRANSPARENT = /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/g

/**
 * Every `rounded-[...]` whose bracket names a measure rather than reading one.
 */
function arbitraryRadii(text: string): string[] {
  const CSS_WIDE = new Set(['inherit', 'initial', 'revert', 'revert-layer', 'unset'])
  return [...text.matchAll(/\brounded(?:-[a-z]+)*-\[([^\]]*)\]/g)]
    .map((match) => match[1]!)
    .filter((value) => !value.includes('var(') && !CSS_WIDE.has(value.trim()))
}

/**
 * Any colour written as a value rather than taken from the token layer.
 */
const LITERAL_COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch)\(\s*[\d.]/

/**
 * `RootError.tsx` is the one file allowed to paint its own colours.
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
 */
const COLOUR_IS_DATA = [join(SRC, 'components', 'blocks', 'field-control.stories.tsx')]

describe('no component carries a visual value', () => {
  // **The rule is about what this project writes**: a shadow or a duration
  // typed into a component is a visual decision escaping the token layer.
  // Every component here is this project's own, so there is nothing to
  // exempt: no vendored tier to carve out.
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
   * **The ratchet.**
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
