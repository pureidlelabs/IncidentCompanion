#!/usr/bin/env node
/**
 * Every comment in the JavaScript family, from the parser rather than from a
 * line prefix.
 *
 * Reads a NUL-separated file list on stdin and writes one JSON object to
 * stdout: each file's comments as line and column spans. The line accounting
 * is not done here -- `.claude/scripts/comment_inventory.py` applies one
 * classifier to these spans and to its own `tokenize` and `ast` spans, and
 * shares the total with the ratio gate and the review queue. Two
 * implementations of the convention would be two conventions.
 *
 *     git ls-files -z '*.ts' | node tools/comment-inventory.mjs
 *
 * The work is done by `local/comment-inventory`, which the root config carries
 * switched off; this turns it on for one run and reads what it reported.
 *
 * A file the config ignores, and a file whose parse failed, are both reported
 * rather than passed off as an empty file -- absent output is not a clean one.
 */
import { ESLint } from 'eslint'
import path from 'node:path'

const RULE = 'local/comment-inventory'

async function main() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  const list = Buffer.concat(chunks).toString('utf8').split('\0').filter(Boolean)

  const eslint = new ESLint({
    // The root config by name, as `lint:ascii` passes it: ESLint 10 otherwise
    // resolves a config per file, and `ui/eslint.config.js` defines no `local`
    // plugin, so the rule below is unknown for every file under `ui/`.
    overrideConfigFile: 'eslint.config.mjs',
    // The glob matches the block that defines the `local` plugin: a rules
    // entry outside it is an unknown rule, and ESLint refuses the whole run.
    overrideConfig: [{
      files: ['**/*.{js,mjs,cjs,ts,tsx,mts,cts}'],
      rules: { [RULE]: 'warn' },
    }],
  })
  const results = await eslint.lintFiles(list)

  const files = []
  const errors = []
  const linted = new Set()
  for (const result of results) {
    const relative = path.relative(process.cwd(), result.filePath)
    linted.add(relative)
    // A warning from another rule says nothing about whether parsing
    // succeeded; only a fatal diagnostic does.
    const fatal = result.messages.find((message) => message.fatal)
    if (fatal) {
      errors.push({ path: relative, error: `parse: ${fatal.message}` })
      continue
    }
    const found = result.messages.find((message) => message.ruleId === RULE)
    if (!found) {
      errors.push({ path: relative, error: 'ignored by the lint config' })
      continue
    }
    files.push({ path: relative, comments: JSON.parse(found.message) })
  }
  for (const asked of list) {
    if (!linted.has(asked)) errors.push({ path: asked, error: 'not linted' })
  }

  files.sort((a, b) => (a.path < b.path ? -1 : 1))
  process.stdout.write(JSON.stringify({ files, errors }))
}

await main()
