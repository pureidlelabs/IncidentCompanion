/**
 * Applies `storeGuards` to the database `DATABASE_URL` names, which has to be
 * the role owning the tables. Runs as `postdb:push`, so every `npm run db:push`
 * ends with it.
 */
import { Client } from 'pg'

import { storeGuards } from '../src/db/schema/store-guards.js'

const client = new Client({ connectionString: process.env.DATABASE_URL ?? '' })
await client.connect()
try {
  for (const statement of storeGuards) await client.query(statement)
} finally {
  await client.end()
}
