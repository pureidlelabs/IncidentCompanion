/**
 * Restores `@nestjs/common/interfaces` as a resolvable specifier.
 *
 * **Nest 12's `exports` map has no entry for a bare directory subpath, and
 * three packages' declarations still import one.** `@nestjs/common` publishes
 * `"./*": "./*.js"`, so `@nestjs/common/interfaces` resolves to
 * `interfaces.js` -- which does not exist, the directory does.
 * `@nestjs/throttler`, `@nestjs/config` and `@nestjs/swagger` all still write
 * `from '@nestjs/common/interfaces'` in their `.d.ts`.
 *
 * **`skipLibCheck` hides that failure and it surfaces one level down as
 * nonsense.** The unresolved import makes `ModuleMetadata` `any`, so
 * `Pick<ModuleMetadata, 'imports'>` becomes `Pick<any, 'imports'>` -- which is
 * `{ imports: any }`, required -- and `ThrottlerModule.forRootAsync` starts
 * demanding an `imports` key it never took. Writing that key silences the
 * error and leaves every throttler type `any`.
 *
 * A `paths` entry cannot do this job here: `paths` targets must be relative,
 * and the packages hoist to the workspace root rather than to `server/`.
 *
 * Delete this the release those three stop importing the bare subpath.
 */
declare module '@nestjs/common/interfaces' {
  export * from '@nestjs/common/interfaces/index.js'
}
