import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Badge } from './badge'

/**
 * A badge that is cut short says so.
 *
 * `Badge` clips on purpose -- `max-w-full` with `overflow-hidden` is what lets
 * a caller constrain it -- and it carried no `text-overflow`, so the cut was
 * silent: `post-incident` read as `post-inciden` with nothing on screen saying
 * a character had gone. For a case's state that is a value an analyst reads to
 * decide what to do. -> #896
 *
 * jsdom lays nothing out, so nothing here is a width claim; whether the cut
 * happens at all is the browser tier's, through the walk's `clipped-text`
 * rule, which fires only where `overflow` is hidden and `text-overflow` is not
 * `ellipsis`.
 */
describe('a clipped badge says it was cut', () => {
  it('declares an ellipsis for the text it clips', () => {
    render(<Badge>post-incident</Badge>)
    const classes = screen.getByText('post-incident').className.split(/\s+/)

    expect(classes, 'the badge clips its text and shows nothing for what it cut').toContain(
      'text-ellipsis',
    )
  })

  it('still clips, so the ellipsis has something to mark', () => {
    // The three only work together: `text-ellipsis` draws nothing without an
    // overflow to mark, the overflow alone is the silent cut, and neither
    // fires at all unless `max-w-full` lets a container cap the badge.
    render(<Badge>post-incident</Badge>)
    const classes = screen.getByText('post-incident').className.split(/\s+/)

    expect(classes).toContain('overflow-hidden')
    expect(classes).toContain('whitespace-nowrap')
    expect(classes).toContain('max-w-full')
  })

  it.each(['xs', 'sm'] as const)('says it at %s, which is what a table draws', (size) => {
    // The default is `sm` and every table uses `xs`, so asserting the default
    // alone leaves the size the defect was found at untested.
    render(<Badge size={size}>post-incident</Badge>)

    expect(screen.getByText('post-incident').className.split(/\s+/)).toContain('text-ellipsis')
  })
})
