/**
 * An interactive shell with the application's own container: `npm run repl`.
 */
import { repl } from '@nestjs/core'

import { AppModule } from './app.module.js'

async function bootstrap(): Promise<void> {
  await repl(AppModule)
}

void bootstrap()
