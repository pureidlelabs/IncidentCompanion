/**
 * Any path the API did not claim gets the app: `GET /cases` loads the SPA.
 *
 * A controller rather than `ServeStaticModule`'s own fallback, and it must be
 * registered last - it sits at `/` and matches every path, so everything the
 * server answers itself comes first.
 */
import { Controller, Get, Inject, NotFoundException, Req, Res } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Public } from '@thallesp/nestjs-better-auth'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Request, Response } from 'express'

import { bundlePath } from './spa.module.js'
import type { Env } from '../config/env.js'

const INDEX = 'index.html'

/**
 * Paths this controller must never answer, however unmatched they are. The
 * exclude list on `ServeStaticModule` does not reach a Nest route, so this is
 * the only list. The prefix test is `/api/` or exactly `/api`.
 */
const NEVER_THE_SHELL = ['/api', '/assets']

@Controller()
export class SpaController {
  private readonly root: string

  constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    this.root = bundlePath(config)
  }

  /**
   * **`{*path}`, and `@Public()`.**
   *
   * The wildcard is Express 5's - a bare `*` matches nothing there and throws
   * no error. `@Public()` because the shell is what *draws* the sign-in
   * screen: guarding it would answer 401 to somebody who has no way to
   * authenticate yet, and the app already refuses every `/api` call without a
   * session.
   */
  @Public()
  @Get('{*path}')
  shell(@Req() request: Request, @Res() response: Response): void {
    const path = (request.path || '').split('?')[0] ?? ''
    // **Compared lower-cased, because this is a denylist and Express routes
    // case-insensitively.** `GET /API/does-not-exist` matches no entry as
    // written and is answered with the shell and a 200 rather than a 404 --
    // the same permissive direction as the case-access guard's own path check.
    // The path itself keeps its casing: it is what the refusal quotes back.
    const matched = path.toLowerCase()
    if (NEVER_THE_SHELL.some((one) => matched === one || matched.startsWith(`${one}/`))) {
      throw new NotFoundException(`Cannot GET ${path}`)
    }
    if (!existsSync(join(this.root, INDEX))) {
      // The API runs without a built front end on purpose - say which half is
      // missing rather than answering a bare 404 for every address.
      throw new NotFoundException(
        'No built front end. Run `npm run build` in `ui`, or set UI_DIR.',
      )
    }
    // **`root` plus a filename, never one absolute path.** `send` refuses
    // dotfiles, and it applies that to every segment it is given - so an
    // absolute path through a directory beginning with a dot answers 404 with
    // no explanation. A checkout under `.claude/worktrees/` is exactly that,
    // which means the bug appears in a worktree and not in the main checkout.
    // `express.static` is unaffected because its root is exempt from the
    // check; this is the difference between the two.
    response.sendFile(INDEX, { root: this.root })
  }
}
