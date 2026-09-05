/**
 * Every name this interface reads is a name something publishes.
 *
 * **Two spellings, one failure: CSS resolves an unknown name to silence.** A
 * `className` naming a utility Tailwind cannot generate compiles, ships and
 * paints nothing; a `var(--x)` with no fallback makes its whole declaration
 * invalid, so the property is dropped rather than defaulted. Neither raises a
 * warning, neither fails a build, and jsdom has no CSS at all -- so no other
 * tier in this project can see either one.
 *
 * `tokens.test.ts` guards the layer from the other end: that every token
 * declared is reachable, and that the vendored tier's `-foreground` spellings
 * still resolve. This is the general form of the same defect, read from the
 * call site rather than from the token file. Its arbitrary-radius rule passes
 * `rounded-[calc(var(--radius)-3px)]` because the bracket contains a `var()` --
 * it is testing that a component reads the scale, and cannot tell a token that
 * exists from one that does not. `--radius` was read four times and declared
 * nowhere; `text-severity-medium-ink` was asked for twice and published never.
 *
 * **A fixed exclusion list, not an inherited one.** Nothing here is
 * exempted for having been wrong first: the only names allowed through are set
 * by a library at runtime or come from Tailwind's own theme, and each is a
 * fact about who writes it rather than a debt.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

const SRC = join(process.cwd(), 'src')
/** The entry, which is what Tailwind compiles: it imports the rest. */
const INDEX = readFileSync(join(SRC, 'styles', 'index.css'), 'utf8')

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
 * A comment naming a token reads exactly like a use of one, and both halves of
 * this check are about what ships. `tokens.test.ts` carries the measurement:
 * one token in the whole tree was alive on prose alone.
 */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const SOURCE = sourceFiles(SRC)
  // This file and `tokens.test.ts` only: both carry the offending spellings as
  // fixtures, and every other test file is scanned like any other source.
  .filter(
    (path) =>
      !path.endsWith('every-name-resolves.rule.test.ts') && !path.endsWith('tokens.test.ts'),
  )
  .map((path) => ({ path, text: code(readFileSync(path, 'utf8')) }))

/**
 * The same files with their comments left in.
 *
 * Every other check here reads code only, because a comment naming a token
 * reads like a use of one. The scanner makes the opposite true for one shape:
 * a class written in prose is a class Tailwind generates, so the rule that
 * looks for those has to see the prose.
 *
 * **And every file, including the two the colour rule skips.** Those two are
 * skipped because they carry colour fixtures; neither carries a shorthand one,
 * and Tailwind scans them like anything else. Excluding them here put two dead
 * rules in the stylesheet from this file's own docstrings -- the comment
 * explaining the defect committing it, where nothing could see.
 */
const RAW_SOURCE = sourceFiles(SRC).map((path) => ({
  path,
  text: readFileSync(path, 'utf8'),
}))

/**
 * Every custom property this tree declares, by any of the four spellings it
 * uses: a CSS declaration, Tailwind's arbitrary-property class
 * (`[--auth-pane-w:30rem]`), an inline style object's key, and
 * `style.setProperty`.
 */
function declaredProperties(): Set<string> {
  const names = new Set<string>()
  for (const { path, text } of SOURCE) {
    if (path.endsWith('.css')) {
      for (const m of text.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)) names.add(m[1]!)
    }
    for (const m of text.matchAll(/\[(--[a-z0-9-]+):/g)) names.add(m[1]!)
    for (const m of text.matchAll(/['"`](--[a-z0-9-]+)['"`]\s*[:,]/g)) names.add(m[1]!)
    for (const m of text.matchAll(/(?:set|remove)Property\(\s*['"`](--[a-z0-9-]+)/g)) {
      names.add(m[1]!)
    }
  }
  return names
}

/**
 * Names a library writes onto the element at runtime, so no source file
 * declares them and none can.
 *
 * React Aria measures a trigger's width and a tree row's depth. A name here is
 * a claim about who sets it, which is checkable by reading that library -- it
 * is not a list of things this project got wrong.
 */
const SET_BY_A_LIBRARY = new Set([
  '--tree-item-level',
  '--trigger-width',
])

/**
 * Tailwind's own theme, which this project declares only part of.
 *
 * A name here is one this tree reads without declaring, which is sound only
 * because the framework ships it. It is empty: every step this project uses is
 * now published in `scale.css`, which is what the ownership rule below holds it
 * to -- a step the scale does not publish is one a design language cannot move.
 */
const TAILWIND_THEME = new Set<string>([])

/**
 * Every `var(--x)` and `utility-(--x)` read with **no fallback**, paired with
 * the file reading it.
 *
 * **The fallback is the whole discriminator.** `var(--rp-ink, var(--ink))` is
 * the library editor's override with the page's own token behind it, and the
 * name being unset is the normal case rather than the defect. Six of those are
 * in `index.css` and none of them is a fault.
 *
 * A name built from an expression -- `var(--presence-${n})`, `--col-${id}-size`
 * -- is skipped: the text carries a prefix rather than a name, and the values
 * behind it are declared or set elsewhere.
 */
function unresolvedReads(): { name: string; path: string }[] {
  const declared = declaredProperties()
  const known = (name: string) =>
    declared.has(name) || SET_BY_A_LIBRARY.has(name) || TAILWIND_THEME.has(name)
  const found: { name: string; path: string }[] = []
  for (const { path, text } of SOURCE) {
    const reads = [
      ...text.matchAll(/var\((--[a-z0-9-]+)(\$\{)?\s*([,)])?/g),
      ...text.matchAll(/[a-z-]+-\((--[a-z0-9-]+)(\$\{)?([,)])/g),
    ]
    for (const m of reads) {
      if (m[2] !== undefined || m[3] === ',') continue
      if (!known(m[1]!)) found.push({ name: m[1]!, path })
    }
  }
  return found
}


/**
 * Every colour-taking utility named anywhere in the tree, as written.
 *
 * **Which of them exist is Tailwind's question, not this file's**, and
 * `deadClasses` puts it to the compiler. What is left here is finding the
 * names to ask about, which is a matter of shape: a `text-`, `bg-` or
 * `border-` followed by a word.
 *
 * Four shapes are not classes and are dropped rather than asked about. A name
 * followed by a colon is a property key -- `'border-color': ...` in a
 * Cytoscape style object, or a declaration in raw CSS. A name inside brackets
 * is part of an arbitrary value, as `border-color` is inside
 * `transition-[color,background-color,border-color,box-shadow]`. A name inside
 * a path is a module specifier, as `text-field` is inside
 * `@/components/ui/text-field`. And the value of a `data-slot` or
 * `data-testid` is the name of a part, which every component in the kit
 * carries and none of which is a utility.
 */
function colourClassesIn(text: string): string[] {
  const utility =
    'text|bg|border|ring|fill|stroke|from|to|via|outline|decoration|caret|accent|placeholder|divide|shadow'
  const withoutIdentifiers = text
    .replace(/\[[^\]\n]*\]/g, '[]')
    .replace(/\bdata-(?:slot|testid)=(['"])[^'"\n]*\1/g, 'data-slot=""')
  return [
    ...withoutIdentifiers.matchAll(
      new RegExp(
        `(?<![a-zA-Z0-9_\\-/.])(?:${utility})-([a-z][a-z0-9-]*)(?![a-zA-Z0-9_-])(?!['"\`]?\\s*[:/])`,
        'g',
      ),
    ),
  ].map((m) => m[0])
}

/**
 * A package's own `package.json`, found by walking up from here.
 *
 * `require.resolve` cannot be used for this: a package with an `exports` map
 * that does not list `./package.json` refuses to hand it over, and two of the
 * stylesheets this file compiles are in that shape.
 */
function packageManifest(id: string): string {
  let dir = SRC
  for (;;) {
    const candidate = join(dir, 'node_modules', id, 'package.json')
    if (existsSync(candidate)) return candidate
    const up = dirname(dir)
    if (up === dir) throw new Error(`cannot find the package ${id}`)
    dir = up
  }
}

/**
 * The names among `candidates` that Tailwind generates no rule for.
 *
 * **The compiler is the only thing that knows.** Whether `text-danger` is a
 * colour that does not exist or a size that does is a question about this
 * project's theme, Tailwind's stock palette and its scales all at once, and
 * every cheaper answer is a guess about which of the three a name belongs to.
 * The heuristic this replaced guessed by role family, and stated its own gap:
 * a wrong first segment named no family and was invisible. Both names it let
 * through were live -- `text-danger` on a dialog's refusal, which is the one
 * line in it an analyst has to notice, and `border-l-foreground` on the
 * highest rank of the case picture's cost edge, which exists so the rank
 * survives a greyscale print.
 *
 * An empty build still emits the theme and the base layers, so "did anything
 * come out" answers yes for a name that does not exist. The selector is what
 * is looked for, with Tailwind's escaping taken back off.
 */
async function compiled(candidates: string[]): Promise<string> {
  const { compile } = await import('tailwindcss')
  const base = join(SRC, 'styles')
  const compiler = await compile(INDEX, {
    base,
    loadStylesheet: (id: string, basedir: string) => {
      if (id.startsWith('.')) {
        const path = join(basedir, id)
        return Promise.resolve({ path, base: dirname(path), content: readFileSync(path, 'utf8') })
      }
      // **A package names its stylesheet in its manifest, not by convention.**
      // `tw-animate-css` publishes only a `style` export condition and does not
      // export its own `package.json`, so neither `require.resolve` nor a
      // guessed path finds it. The silent empty-string fallback this replaced
      // hid that: the theme compiled without it and said nothing.
      const manifestPath = packageManifest(id)
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        exports?: { '.'?: { style?: string } }
        style?: string
        main?: string
      }
      const entry = manifest.exports?.['.']?.style ?? manifest.style ?? manifest.main
      if (entry?.endsWith('.css') !== true) {
        throw new Error(`${id} names no stylesheet in its manifest`)
      }
      const path = join(dirname(manifestPath), entry)
      return Promise.resolve({ path, base: dirname(path), content: readFileSync(path, 'utf8') })
    },
    loadModule: async (id: string) => {
      const loaded = (await import(id)) as { default?: unknown }
      return { path: id, base, module: (loaded.default ?? loaded) as never }
    },
  })
  return compiler.build(candidates).replaceAll('\\', '')
}

/** The names among `candidates` that Tailwind generates no rule for. */
async function deadClasses(candidates: string[]): Promise<string[]> {
  const css = await compiled(candidates)
  return candidates.filter((candidate) => !css.includes(`.${candidate}`))
}

/**
 * Names of this shape that are not classes, each a fact about what the string
 * is rather than a debt.
 *
 * Kept live by the test below, as the other two lists are: a name nothing
 * reads any more is an exemption covering nothing.
 */
const NOT_A_CLASS: readonly (readonly [string, string])[] = [
  // The SVG attribute, asserted by name on a drawn path.
  ['stroke-dasharray', 'components/ui/drawn-check.stories.tsx'],
  // A socket message's `type`, in a test that rejects an unknown one.
  ['from-a-later-release', 'api/presence.test.ts'],
]

/**
 * Whether this name, *in this file*, is one of the two that are not classes.
 *
 * Keyed on the file as well as the name: a global exemption would go on
 * excusing the spelling if somebody later wrote it as a class somewhere else,
 * which is the thing the rule exists to catch.
 */
const notAClass = (cls: string, path: string) =>
  NOT_A_CLASS.some(([name, file]) => name === cls && path.endsWith(file))

describe('every name the interface reads resolves', () => {
  it('reads the whole tree, which is what a wrong root would empty', () => {
    for (const dir of ['components', 'screens', 'app', 'styles', 'lib']) {
      expect(
        SOURCE.some(({ path }) => path.includes(`${sep}${dir}${sep}`)),
        dir,
      ).toBe(true)
    }
    expect(declaredProperties().size).toBeGreaterThan(100)
  })

  it('catches a var() nothing declares, and lets a fallback through', () => {
    // Fixtures rather than a live read: once the tree is clean nothing else
    // here proves the predicate still fires.
    const declared = declaredProperties()
    expect(declared.has('--severity-critical-type')).toBe(true)
    expect(declared.has('--auth-pane-w')).toBe(true)
    expect(declared.has('--never-declared-anywhere')).toBe(false)
  })

  it('declares every custom property it reads without a fallback', () => {
    expect(
      unresolvedReads().map(({ name, path }) => `${path.replace(SRC, '')}: ${name}`).sort(),
    ).toEqual([])
  })

  it('catches a class Tailwind generates nothing for, and lets the real ones through', async () => {
    // Fixtures rather than a live read: once the tree is clean nothing else
    // here proves the predicate still fires. The first four are the shapes
    // that have actually shipped -- a wrong first segment, a wrong suffix, and
    // a role family that does not exist.
    expect(
      await deadClasses([
        'text-danger',
        'border-l-foreground',
        'text-severity-medium-ink',
        'bg-sidebar-nothing',
        'text-inkk-muted',
      ]),
    ).toEqual([
      'text-danger',
      'border-l-foreground',
      'text-severity-medium-ink',
      'bg-sidebar-nothing',
      'text-inkk-muted',
    ])
    // A published role, an opacity modifier, a stock palette colour, one of
    // Tailwind's own scales, and a logical-property edge all resolve.
    expect(
      await deadClasses([
        'text-severity-medium',
        'bg-muted/50',
        'border-input',
        'bg-red-500',
        'text-2xs',
        'border-b',
        'border-transparent',
        'border-l-ink',
        'hover:bg-muted/40',
      ]),
    ).toEqual([])
  })

  it('leaves every scale utility reading its variable, not a baked value', async () => {
    /**
     * **A utility that inlines its value is a token a language cannot reach.**
     * Declaring a measure in a namespace is only worth it while the class emits
     * `var(--x)`, so `[data-language]` redefining the name moves every use.
     *
     * Tailwind inlines where knowing the value buys it something: it decomposes
     * a shadow it can read, so that `shadow-<colour>` can work. `shadow-lg`
     * then emitted its offsets and colour directly and elevation quietly left
     * the language axis. Nothing rendered differently -- `--tw-shadow-color` is
     * `initial`, so the baked colour is the one that applies either way -- which
     * is why no capture could have caught it.
     *
     * Elevation is bridged through `--elevation-*` for that reason. This holds
     * the rest of the scale to the same standard.
     */
    const cases: readonly (readonly [string, string])[] = [
      ['shadow-lg', '--elevation-lg'],
      ['rounded-lg', '--radius-lg'],
      ['text-sm', '--text-sm'],
      ['h-control-md', '--spacing-control-md'],
      ['font-medium', '--font-weight-medium'],
      ['leading-normal', '--leading-normal'],
      ['tracking-micro', '--tracking-micro'],
      ['max-w-field', '--container-field'],
    ]
    const css = await compiled(cases.map(([cls]) => cls))
    for (const [cls, token] of cases) {
      const escaped = cls.replace(/[-.]/g, (m) => '\\' + m)
      const rule = new RegExp(`\\.${escaped}\\s*\\{([^}]*)\\}`).exec(css)
      expect(rule, `${cls} generates no rule`).not.toBeNull()
      expect(rule![1], `${cls} should read var(${token})`).toContain(`var(${token})`)
    }
  })

  it('spends only the steps this project publishes', () => {
    /**
     * **A step the scale does not publish is not invalid, which is why nothing
     * caught it.** `rounded-xl` compiles, renders, and reads Tailwind's own
     * `--radius-xl` -- which is `0.75rem`, exactly what this project's
     * `--radius-lg` holds. So it drew identically to the step beside it on
     * fifteen call sites covering every card, dialog, sheet, toast and empty
     * state, and no check here noticed, because every check asked whether a
     * class was *real* and none asked whether it was *ours*.
     *
     * It surfaced by dragging `--radius-lg` in the token playground and
     * watching the card not move: a utility outside the scale is one a design
     * language cannot reach.
     *
     * The exemptions are words Tailwind owns rather than steps: `full` and
     * `none` for a radius, `none` for a shadow or a leading. A namespace this
     * project does not override at all is not checked -- there is no scale to
     * be outside of.
     */
    const scale = readFileSync(join(SRC, 'styles', 'scale.css'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    )
    const published = (namespace: string) =>
      new Set(
        [...scale.matchAll(new RegExp(`^\\s*--${namespace}-([a-z0-9]+):`, 'gm'))].map(
          (m) => m[1]!,
        ),
      )

    /** utility prefix -> the namespace it reads, and the words Tailwind owns. */
    const NAMESPACES: readonly (readonly [string, string, readonly string[]])[] = [
      ['rounded(?:-(?:[tblr]|tl|tr|bl|br|s|e|ss|se|es|ee))?', 'radius', ['full', 'none']],
      ['shadow', 'shadow', ['none']],
      ['leading', 'leading', ['none']],
      ['tracking', 'tracking', []],
    ]

    const offenders: string[] = []
    for (const [prefix, namespace, owned] of NAMESPACES) {
      const ours = published(namespace)
      expect(ours.size, `scale.css publishes no --${namespace}-*`).toBeGreaterThan(0)
      const pattern = new RegExp(
        `(?<![a-zA-Z0-9_\\-/.])${prefix}-([a-z0-9]+)(?![a-zA-Z0-9_-])`,
        'g',
      )
      for (const { path, text } of SOURCE) {
        if (path.endsWith('.css')) continue
        for (const m of text.matchAll(pattern)) {
          const step = m[1]!
          if (ours.has(step) || owned.includes(step)) continue
          offenders.push(`${path.replace(SRC, '')}: ${m[0]}`)
        }
      }
    }
    expect([...new Set(offenders)].sort()).toEqual([])
  })

  it('generates no utility that reads a token nothing declares', async () => {
    /**
     * **A comment is markup as far as the scanner is concerned.**
     * Tailwind extracts candidates from every file it is pointed at, without
     * knowing prose from JSX, so spelling the variable shorthand out in a
     * docstring is enough to generate that class -- and if the token has
     * since been renamed or deleted, the rule reads a name nothing declares
     * and resolves to nothing.
     *
     * It has happened four times here. A comment warning against the shorthand
     * spelled it and emitted a rule for a token the rename had removed; a
     * docstring naming a table-height class survived, by luck, only because
     * the token came back in the same commit; a docstring illustrating the
     * three spellings of a translucent background named one nothing declares,
     * and put two rules into the shipped stylesheet; and this file's own
     * explanation of all that did it twice more.
     *
     * **Whether a shape is a class is the compiler's question.** `utility-(--x)`
     * looks exactly like one and generates nothing, because `utility` is no
     * utility. So each candidate is compiled, and only the ones that produce a
     * rule are held to naming a declared token.
     */
    const shorthand = new Map<string, string>()
    for (const { path, text } of RAW_SOURCE) {
      for (const m of text.matchAll(/(?<![a-zA-Z0-9_-])(-?[a-z][a-z-]*-\((--[a-z0-9-]+)\))/g)) {
        if (!shorthand.has(m[1]!)) shorthand.set(m[1]!, path.replace(SRC, ''))
      }
    }
    // The scan has to find some, or this passes over nothing.
    expect(shorthand.size).toBeGreaterThan(5)

    const css = await compiled([...shorthand.keys()])
    const declared = declaredProperties()
    const known = (name: string) =>
      declared.has(name) || SET_BY_A_LIBRARY.has(name) || TAILWIND_THEME.has(name)

    const dangling = [...shorthand]
      .filter(([cls]) => css.includes(`.${cls}`))
      .map(([cls, path]) => ({ cls, path, token: /\((--[a-z0-9-]+)\)/.exec(cls)![1]! }))
      .filter(({ token }) => !known(token))
      .map(({ cls, path, token }) => `${path}: ${cls} reads ${token}, which nothing declares`)
      .sort()
    expect(dangling).toEqual([])
  })

  it('names only colour classes Tailwind can generate', async () => {
    const asked = new Map<string, string[]>()
    for (const { path, text } of SOURCE) {
      for (const cls of new Set(colourClassesIn(text))) {
        if (notAClass(cls, path)) continue
        asked.set(cls, [...(asked.get(cls) ?? []), path.replace(SRC, '')])
      }
    }
    // The scan has to reach something, or an extractor that matched nothing
    // would report the tree clean.
    expect(asked.size).toBeGreaterThan(100)

    const offenders = (await deadClasses([...asked.keys()]))
      .flatMap((cls) => (asked.get(cls) ?? []).map((path) => `${path}: ${cls}`))
      .sort()
    expect(offenders).toEqual([])
  })

  it('keeps both exclusion lists live, so neither can rot into an excuse', () => {
    // A name nothing reads any more is an exemption covering nothing, and the
    // next reader trusts it. Both lists may only shrink as the vendored tier
    // and its libraries go.
    const read = new Set(
      SOURCE.flatMap(({ text }) => [
        ...[...text.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]!),
        ...[...text.matchAll(/[a-z-]+-\((--[a-z0-9-]+)\)/g)].map((m) => m[1]!),
      ]),
    )
    expect([...SET_BY_A_LIBRARY].filter((name) => !read.has(name)).sort()).toEqual([])
    expect([...TAILWIND_THEME].filter((name) => !read.has(name)).sort()).toEqual([])

    // Each exemption must still be named by the file it names, or it is
    // covering nothing and the next reader trusts it.
    const stale = NOT_A_CLASS.filter(
      ([name, file]) =>
        !SOURCE.some(({ path, text }) => path.endsWith(file) && colourClassesIn(text).includes(name)),
    ).map(([name, file]) => `${name} in ${file}`)
    expect(stale.sort()).toEqual([])
  })
})
