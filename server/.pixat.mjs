import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'

const [, , file, ...ys] = process.argv
const img = PNG.sync.read(readFileSync(file))

for (const raw of ys) {
  const y = Number(raw)
  const at = (x) => {
    const i = (img.width * y + x) << 2
    return `${String(img.data[i])},${String(img.data[i + 1])},${String(img.data[i + 2])}`
  }
  console.log(`y=${String(y)}  x=300:${at(300)}  x=600:${at(600)}  x=900:${at(900)}`)
}
