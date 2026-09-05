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
 * **Its own module because it outlived the one it was declared in.**
 * `timelineLayout.ts` drew the SVG timeline graph; the cascade replaced that
 * and the file went, but every graph still needs this type. A type left behind
 * in a deleted module's file keeps ~600 lines of dead layout code compiling -
 * and `structure.test.ts` cannot see that, because `import type` erases at
 * build and still counts as a product import.
 */
export type GraphEntry = TimelineEntry
