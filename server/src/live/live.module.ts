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
 */
@Module({
  imports: [ProseModule],
  providers: [
    PresenceStore,
    CaseChannel,
    LiveGateway,
    /**
     * **The document's relay is the presence store.**
     */
    { provide: PROSE_RELAY, useExisting: PresenceStore },
  ],
  exports: [CaseChannel, LiveGateway],
})
export class LiveModule {}
