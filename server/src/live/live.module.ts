import { Module } from '@nestjs/common'

import { CaseChannel } from './case-channel.service.js'
import { PresenceStore } from './presence.store.js'
import { LiveGateway } from './live.gateway.js'
import { ProseModule } from '../prose/prose.module.js'
import { PROSE_RELAY, type ProseRelay } from '../prose/prose.service.js'

/**
 * The type check behind the `useExisting` below, which Nest resolves at
 * runtime without one - it binds a store that has drifted from the interface
 * happily, and the first sign is a document that stops crossing instances.
 */
const _relayIsSatisfied: ProseRelay = undefined as unknown as PresenceStore
void _relayIsSatisfied

/**
 * The case socket.
 *
 * **`PresenceStore` stays internal; the other two are exported.** Nothing
 * outside needs to know where the roster is kept, which is what keeps Redis an
 * implementation detail here. `LiveGateway` is exported for one caller:
 * `main.ts` hands it the HTTP server, because an `upgrade` happens below Nest
 * and there is no route to hang it on.
 */
@Module({
  imports: [ProseModule],
  providers: [
    PresenceStore,
    CaseChannel,
    LiveGateway,
    /**
     * **The document's relay is the presence store.** `ProseService` declares
     * what it needs and knows nothing about Redis or sockets; binding it here
     * is what lets two instances converge on one report without the record
     * depending on the transport.
     */
    { provide: PROSE_RELAY, useExisting: PresenceStore },
  ],
  exports: [CaseChannel, LiveGateway],
})
export class LiveModule {}
