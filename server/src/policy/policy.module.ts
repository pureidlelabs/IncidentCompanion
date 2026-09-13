/**
 * The install's own bounds, as an injectable, to every layer that has a door.
 *
 * **`@Global`, and that is the point.** A bound is read at the moment a control
 * acts, and the controls are spread across layers that may not reach the
 * database: `evidence/` is bytes on disk, `archive/` is a pure transformation
 * of them, and `case-archive/` and `health/` sit above both. Before this, every
 * one of them held a constant of its own -- which is how three settings came to
 * be registered, bounded, offered and audited while nothing read any of them.
 * -> #588
 *
 * The alternative was to widen the layer graph so four folders may reach `db/`,
 * which buys them a query tier to answer one question.
 */
import { Global, Module } from '@nestjs/common'

import { PolicyService } from './policy.service.js'

@Global()
@Module({ providers: [PolicyService], exports: [PolicyService] })
export class PolicyModule {}
