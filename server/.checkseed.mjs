import pg from 'pg'

const kind = process.argv[2] ?? 'templates'
const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
const { rows } = await client.query(
  'select name, label, position, description from library where kind = $1 order by position',
  [kind],
)
for (const r of rows) {
  const d = r.description ?? ''
  console.log(`${String(r.position).padStart(3)}  ${r.name.padEnd(24)} ${r.label.padEnd(26)} ${d === '' ? '(EMPTY)' : d.slice(0, 60)}`)
}
console.log(`\n${rows.length} rows, ${rows.filter((r) => (r.description ?? '') !== '').length} with a description`)
await client.end()
