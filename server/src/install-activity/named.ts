/**
 * The mark a route leaves when it has named what it did.
 *
 * **Its own module, because the two files that need it import each other.**
 * `AuditInterceptor` injects `InstallActivityService`, and the service marks
 * the request so the interceptor stays quiet - a cycle that TypeScript accepts
 * and ESM resolves by leaving one side `undefined` at runtime. Nest then
 * reports *"can't resolve dependencies of the AuditInterceptor (?)"*, which
 * reads as a missing provider and is not one.
 */
export const NAMED = Symbol('audit.named')
