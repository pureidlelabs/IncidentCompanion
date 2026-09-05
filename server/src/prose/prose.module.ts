/**
 * The written prose.
 *
 * **No controller.** Prose does not travel over HTTP at all - it rides the case
 * socket, which already carries presence and the change feed behind the origin
 * check, the session and the case-access check. A route beside it would be a
 * second door onto the same document with its own authorisation to get right.
 */
import { Module } from '@nestjs/common'

import { ProseService } from './prose.service.js'

/**
 * **No relay provided here.** The document declares the interface it needs and
 * `LiveModule` binds the presence store to it, because that is where the
 * transport lives - this module would have to import the socket tier to bind it
 * itself, which is the arrow the layering rule refuses.
 */
@Module({
  providers: [ProseService],
  exports: [ProseService],
})
export class ProseModule {}
