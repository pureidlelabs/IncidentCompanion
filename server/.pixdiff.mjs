import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'

const [, , a, b] = process.argv
const one = PNG.sync.read(readFileSync(a))
const two = PNG.sync.read(readFileSync(b))

if (one.width !== two.width || one.height !== two.height) {
  console.log('different sizes')
  process.exit(1)
}

// Rows where the two images differ, and by how much - a horizontal artefact
// shows up as a handful of rows with a large count.
const rows = []
for (let y = 0; y < one.height; y++) {
  let differing = 0
  let worst = 0
  for (let x = 0; x < one.width; x++) {
    const i = (one.width * y + x) << 2
    const d =
      Math.abs(one.data[i] - two.data[i]) +
      Math.abs(one.data[i + 1] - two.data[i + 1]) +
      Math.abs(one.data[i + 2] - two.data[i + 2])
    if (d > 6) {
      differing++
      if (d > worst) worst = d
    }
  }
  if (differing > 0) rows.push({ y, differing, worst })
}

console.log(`${String(rows.length)} rows differ`)
for (const row of rows.slice(0, 40)) {
  console.log(`  y=${String(row.y)}  px=${String(row.differing)}  worst=${String(row.worst)}`)
}
