/**
 * The whole schema, in one object.
 *
 * Both callers need every table: `drizzle({ client, schema })` types the query
 * builder from it, and `drizzleAdapter(db, { schema })` resolves Better Auth's
 * models by looking table names up in it. A table missing here is not a type
 * error at the adapter boundary - it is a runtime failure on the first query
 * that needs it.
 */
export * from './auth.js'
export * from './case.js'
export * from './customer.js'
export * from './groups.js'
export * from './change-feed.js'
export * from './install-activity.js'
export * from './conflicts.js'
export * from './preferences.js'
export * from './entities.js'
export * from './timeline.js'
export * from './tracker.js'
export * from './library.js'
export * from './language.js'
export * from './case-visits.js'
export * from './report.js'
export * from './case-compliance.js'
export * from './columns.js'
