/**
 * The one Redis connection the session cache uses, and the thing that closes it.
 *
 * **A module-level instance, because the connection is needed before Nest's
 * providers exist**: `BetterAuthModule.forRootAsync`'s factory builds the auth
 * object during module initialisation and cannot inject from the module that
 * imports it. This class exists to be a provider Nest *will* shut down.
 *
 * **Closing it is not tidiness.** An open ioredis handle keeps the event loop
 * alive, which in vitest reads as a suite that hangs rather than fails - and
 * one describe block ending the pool takes the next one down with it.
 */
import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common'
import { Redis } from 'ioredis'

let shared: Redis | null = null

@Injectable()
export class AuthRedis implements OnApplicationShutdown {
  private readonly log = new Logger(AuthRedis.name)

  /**
   * **One per process, not one per call.** Nest builds the auth object once,
   * but the harness boots several applications in a run; without this a file
   * would open a connection per boot and exhaust the server's limit long
   * before the suite finished.
   */
  static connect(url: string): Redis {
    shared ??= new Redis(url, {
      // **Fail fast rather than queue.** The store falls back to Postgres on
      // an error, so a command that waits forever for a reconnect is worse
      // than one that throws: the first is a hung request, the second is a
      // database read.
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    })
    return shared
  }

  async onApplicationShutdown(): Promise<void> {
    if (!shared) return
    try {
      await shared.quit()
    } catch (error) {
      // A connection that is already gone is the ordinary case on a stack torn
      // down underneath us; nothing here is worth failing a shutdown for.
      this.log.debug(`closing the session cache connection: ${String(error)}`)
    } finally {
      /**
       * **`disconnect()` as well, because `quit()` is a command.** `QUIT` has
       * to be written to the socket, and with `enableOfflineQueue: false` it
       * rejects the moment the stream is not writeable -- precisely when Redis
       * is away, which is the case this whole design exists for. Catching that
       * and nulling the reference drops the last handle on a client that is
       * still reconnecting, and the process outlives the shutdown handler.
       * `disconnect()` is synchronous, needs no
       * writeable socket, and is safe to call on an already-closed client.
       */
      shared.disconnect()
      shared = null
    }
  }
}
