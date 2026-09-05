/**
 * The one Redis connection the session cache uses, and the thing that closes it.
 */
import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common'
import { Redis } from 'ioredis'

let shared: Redis | null = null

@Injectable()
export class AuthRedis implements OnApplicationShutdown {
  private readonly log = new Logger(AuthRedis.name)

  /**
   * **One per process, not one per call.**
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
       * **`disconnect()` as well, because `quit()` is a command.**
       */
      shared.disconnect()
      shared = null
    }
  }
}
