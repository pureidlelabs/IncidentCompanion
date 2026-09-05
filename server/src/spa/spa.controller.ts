/**
 * Any path the API did not claim gets the app: `GET /cases` loads the SPA.
 */
import { Controller, Get, Inject, NotFoundException, Req, Res } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Public } from '@thallesp/nestjs-better-auth'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Request, Response } from 'express'

import { bundlePath } from './spa.module.js'
import type { Env } from '../config/env.js'

/** The shell's filename, sent relative to the bundle - see `shell`. */
const INDEX = 'index.html'

/**
 * Paths this controller must never answer, however unmatched they are.
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
   */
  @Public()
  @Get('{*path}')
  shell(@Req() request: Request, @Res() response: Response): void {
    const path = (request.path || '').split('?')[0] ?? ''
    // **Compared lower-cased, because this is a denylist and Express routes
    // case-insensitively.** `GET /API/does-not-exist` missed every entry and
    // was answered with the shell and a 200 rather than a 404 -- the same
    // class as the case-access guard's, and the same permissive direction.
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
