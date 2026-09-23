/**
 * Creates the functions the row-level-security policies call, from
 * `src/db/reach.sql`, so the push that follows can create those policies.
 *
 * Reads `DATABASE_URL`, which has to name the role owning the tables: a
 * function reads the rows it decides about as its owner.
 */
import { readFile } from 'node:fs/promises'
import { Client } from 'pg'

const client = new Client({ connectionString: process.env.DATABASE_URL ?? '' })
await client.connect()
await client.query(await readFile(new URL('../src/db/reach.sql', import.meta.url), 'utf8'))
await client.end()
