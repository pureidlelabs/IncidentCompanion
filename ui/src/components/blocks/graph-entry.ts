import type { TimelineEntry } from '@/api/model'

/**
 * A timeline entry as a *graph* reads it, which is not as the case stores it.
 *
 * **Both halves, and the event's own fields readable as absent.** A cascade
 * draws attack runs *and* response runs and tells them apart by `kind`, so
 * narrowing this to the event half was wrong - it deleted the distinction the
 * drawing is made of. `TimelineEntry` carries every key of either half with
 * the other's typed `undefined`, so `entry.severity` compiles and has to be
 * handled rather than silently read off a response record.
 *
 * `ukcPhase` and `ukcCycle` are derived on read and stored nowhere; they come
 * from the server's own `KillChainPlacement` on the event row, so they are no
 * longer redeclared here.
 *
 * **Its own module because every graph needs it and no one graph owns it.**
 * A type left in the module of whichever graph declared it first keeps that
 * module's layout code compiling once the graph itself is replaced -
 * and `structure.test.ts` cannot see that, because `import type` erases at
 * build and still counts as a product import.
 */
export type GraphEntry = TimelineEntry
