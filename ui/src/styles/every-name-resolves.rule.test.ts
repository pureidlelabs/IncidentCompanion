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
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

const SRC = join(process.cwd(), 'src')
/** The entry, which is what Tailwind compiles: it imports the rest. */
const INDEX = readFileSync(join(SRC, 'styles', 'index.css'), 'utf8')
/** The republication, which is where a `--color-*` name is minted. */
const THEME = readFileSync(join(SRC, 'styles', 'theme.css'), 'utf8')

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
 */
const RAW_SOURCE = sourceFiles(SRC)
  .filter(
    (path) =>
      !path.endsWith('every-name-resolves.rule.test.ts') && !path.endsWith('tokens.test.ts'),
  )
  .map((path) => ({ path, text: readFileSync(path, 'utf8') }))

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
 * `scale.css` names `--radius-xs` through `--radius-lg` and `--radius-full`, and
 * three weights; the rest of each scale stays Tailwind's. A name here is one
 * this tree reads without declaring, which is sound only because the framework
 * ships it -- `--font-weight-bold` is 700 in Tailwind's own theme, and the paper
 * preview's headings read it rather than writing the number out.
 */
const TAILWIND_THEME = new Set<string>(['--font-weight-bold'])

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

/** Every colour role `@theme inline` publishes, so every `bg-`/`text-` that can exist. */
function publishedRoles(): Set<string> {
  const block = /@theme inline\s*\{([\s\S]*?)\n\}/.exec(THEME)
  if (!block) throw new Error('theme.css has no `@theme inline` block')
  return new Set([...block[1]!.matchAll(/^\s*--color-([a-z0-9-]+):/gm)].map((m) => m[1]!))
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
async function deadClasses(candidates: string[]): Promise<string[]> {
  const { compile } = await import('tailwindcss')
  const base = join(SRC, 'styles')
  const compiler = await compile(INDEX, {
    base,
    loadStylesheet: (id: string, basedir: string) => {
      if (id.startsWith('.')) {
        const path = join(basedir, id)
        return Promise.resolve({ path, base: dirname(path), content: readFileSync(path, 'utf8') })
      }
      const leaf = id.split('/').pop() ?? id
      for (const guess of [`${id}/index.css`, `${id}/dist/${leaf}.css`, id]) {
        try {
          const path = createRequire(import.meta.url).resolve(guess)
          if (!path.endsWith('.css')) continue
          return Promise.resolve({
            path,
            base: dirname(path),
            content: readFileSync(path, 'utf8'),
          })
        } catch {
          continue
        }
      }
      return Promise.resolve({ path: id, base: basedir, content: '' })
    },
    loadModule: async (id: string) => {
      const loaded = (await import(id)) as { default?: unknown }
      return { path: id, base, module: (loaded.default ?? loaded) as never }
    },
  })
  const css = compiler.build(candidates).replaceAll('\\', '')
  return candidates.filter((candidate) => !css.includes(`.${candidate}`))
}

/**
 * Names of this shape that are not classes, each a fact about what the string
 * is rather than a debt.
 *
 * Kept live by the test below, as the other two lists are: a name nothing
 * reads any more is an exemption covering nothing.
 */
const NOT_A_CLASS = new Set([
  // The SVG attribute, asserted by name on a drawn path.
  'stroke-dasharray',
  // A socket message's `type`, in a test that rejects an unknown one.
  'from-a-later-release',
])

describe('every name the interface reads resolves', () => {
  it('reads the whole tree, which is what a wrong root would empty', () => {
    for (const dir of ['components', 'screens', 'app', 'styles', 'lib']) {
      expect(
        SOURCE.some(({ path }) => path.includes(`${sep}${dir}${sep}`)),
        dir,
      ).toBe(true)
    }
    expect(declaredProperties().size).toBeGreaterThan(100)
    expect(publishedRoles().size).toBeGreaterThan(30)
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

  it('generates no utility that reads a token nothing declares', () => {
    /**
     * **A comment is markup as far as the scanner is concerned.**
     * Tailwind extracts candidates from every file it is pointed at, without
     * knowing prose from JSX, so writing `h-(--a-token)` in a docstring is
     * enough to generate the class -- and if the token has since been renamed
     * or deleted, the rule it generates reads a name nothing declares and
     * resolves to nothing.
     *
     * It has happened twice here. A comment in `tokens.test.ts` warning against
     * the variable shorthand spelled it out and emitted a rule for a token the
     * rename had removed; and a docstring naming a `max-h-(--table-viewport-h)`
     * survived, by luck, only because the token came back in the same commit.
     * Neither is visible in review: the source reads as prose and the defect is
     * in the stylesheet.
     *
     * So this asks the compiler, over every `utility-(--token)` the tree
     * contains in any position at all -- code, comment or string.
     */
    const shorthand = new Set<string>()
    const where = new Map<string, string>()
    for (const { path, text } of RAW_SOURCE) {
      for (const m of text.matchAll(/(?<![a-zA-Z0-9_-])(-?[a-z][a-z-]*-\((--[a-z0-9-]+)\))/g)) {
        shorthand.add(m[1]!)
        if (!where.has(m[1]!)) where.set(m[1]!, path.replace(SRC, ''))
      }
    }
    // The scan has to find some, or this passes over nothing.
    expect(shorthand.size).toBeGreaterThan(5)

    const declared = declaredProperties()
    const known = (name: string) =>
      declared.has(name) || SET_BY_A_LIBRARY.has(name) || TAILWIND_THEME.has(name)

    const dangling = [...shorthand]
      .map((cls) => ({ cls, token: /\((--[a-z0-9-]+)\)/.exec(cls)![1]! }))
      .filter(({ token }) => !known(token))
      .map(({ cls, token }) => `${where.get(cls)!}: ${cls} reads ${token}, which nothing declares`)
      .sort()
    expect(dangling).toEqual([])
  })

  it('names only colour classes Tailwind can generate', async () => {
    const asked = new Map<string, string[]>()
    for (const { path, text } of SOURCE) {
      for (const cls of new Set(colourClassesIn(text))) {
        if (NOT_A_CLASS.has(cls)) continue
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

    const named = new Set(SOURCE.flatMap(({ text }) => colourClassesIn(text)))
    expect([...NOT_A_CLASS].filter((name) => !named.has(name)).sort()).toEqual([])
  })
})
