import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { CodeBlock } from './code-block'
import { MAX_HIGHLIGHT_LINES, resetHighlighter } from './code-block-highlight'

/**
 * The block, attacked at what a paste can do to the DOM.
 */

const scroll = () => screen.getByRole('region')

/** Every character the block put on the page, lines included. */
const rendered = () => scroll().textContent

beforeEach(() => {
  resetHighlighter()
})

describe('what reaches the page', () => {
  it('renders the source before any grammar has loaded', () => {
    render(<CodeBlock code="Get-Process -Name svchost" language="powershell" />)
    // Synchronously, on the first paint: the highlight has not resolved.
    expect(rendered()).toContain('Get-Process -Name svchost')
  })

  it('still holds every character once the grammar has coloured it', async () => {
    const source = 'Get-WmiObject -Class Win32_Process | Where-Object { $_.Name -eq "x.exe" }'
    render(<CodeBlock code={source} language="powershell" />)
    await waitFor(() => {
      expect(scroll().querySelectorAll('[style*="--code-"]').length).toBeGreaterThan(3)
    })
    expect(rendered()).toContain(source)
  })

  it('renders an unknown language as plain text and colours nothing', async () => {
    render(<CodeBlock code={'def f():\n    pass'} language="python" />)
    await waitFor(() => {
      expect(rendered()).toContain('def f():')
    })
    expect(scroll().querySelectorAll('[style]')).toHaveLength(0)
  })

  it('renders an empty string without falling over', () => {
    render(<CodeBlock code="" language="powershell" />)
    expect(scroll()).toBeInTheDocument()
    expect(rendered().trim()).toBe('')
  })

  it('gives a line for every line of a paste past the highlight ceiling', async () => {
    const lines = MAX_HIGHLIGHT_LINES + 5
    const source = Array.from({ length: lines }, (_, i) => `line ${String(i)}`).join('\n')
    render(<CodeBlock code={source} language="powershell" lineNumbers />)
    await waitFor(() => {
      expect(rendered()).toContain(`line ${String(lines - 1)}`)
    })
    // The gutter's last number is the last line, so nothing was dropped and
    // nothing was counted twice.
    expect(rendered()).toContain(String(lines))
    expect(rendered()).not.toContain(String(lines + 1))
  })

  it('puts markup on the page as text, never as elements', async () => {
    const hostile = '<script>alert("x")</script><img src=x onerror=alert(1)>'
    render(<CodeBlock code={hostile} language="bash" />)
    await waitFor(() => {
      expect(rendered()).toContain('<script>')
    })
    expect(scroll().querySelector('script')).toBeNull()
    expect(scroll().querySelector('img')).toBeNull()
    expect(rendered()).toContain(hostile)
  })

  it('keeps a two thousand character line on one line', async () => {
    const wide = `Write-Host "${'A'.repeat(2000)}"`
    render(<CodeBlock code={wide} language="powershell" lineNumbers />)
    await waitFor(() => {
      expect(rendered()).toContain('AAAA')
    })
    expect(rendered()).toContain(wide)
    // One gutter number, so the width was never turned into extra lines. The
    // scroll itself has no box in jsdom -- the story tier is what sees it.
    expect(scroll().querySelectorAll('[aria-hidden="true"]')).toHaveLength(1)
  })

  it('recolours when the code changes underneath it', async () => {
    const { rerender } = render(<CodeBlock code="Get-Process" language="powershell" />)
    await waitFor(() => {
      expect(scroll().querySelectorAll('[style*="--code-"]').length).toBeGreaterThan(0)
    })
    rerender(<CodeBlock code="Stop-Service -Name spooler" language="powershell" />)
    await waitFor(() => {
      expect(rendered()).toContain('Stop-Service -Name spooler')
    })
    expect(rendered()).not.toContain('Get-Process')
  })
})

describe('the scroll region and its name', () => {
  it('is a focusable region carrying the scroll', () => {
    render(<CodeBlock code="ls -la" language="bash" />)
    expect(scroll().tagName).toBe('PRE')
    expect(scroll()).toHaveAttribute('tabindex', '0')
    expect(scroll().className).toContain('overflow-x-auto')
  })

  it.each([
    [{ code: 'ls', language: 'bash' }, 'bash'],
    [{ code: 'SecurityEvent | take 1', language: 'kusto' }, 'kql'],
    [{ code: 'ls', language: 'bash', label: 'restore.sh' }, 'restore.sh'],
    [{ code: 'ls' }, 'Code'],
    [{ code: 'ls', language: 'bash', 'aria-label': 'The command the attacker ran' }, 'The command the attacker ran'],
  ])('names itself %#', (props, expected) => {
    render(<CodeBlock {...props} />)
    expect(screen.getByRole('region', { name: expected })).toBeInTheDocument()
  })

  it('shows the resolved grammar rather than the spelling that was passed', () => {
    render(<CodeBlock code="ls" language="zsh" />)
    // `zsh` and `bash` are the same grammar here; saying `zsh` would claim a
    // grammar this kit does not carry.
    expect(screen.getByRole('region', { name: 'bash' })).toBeInTheDocument()
  })
})

describe('copy', () => {
  /**
   * **A saved query is re-run, so copy is the feature rather than a
   * convenience.**
   */
  it('puts the source on the clipboard, gutter numbers and all rendering aside', async () => {
    const query = [
      'SecurityEvent',
      '| where TimeGenerated > ago(4h)',
      '| where EventID == 4688',
      '| project TimeGenerated, Account, CommandLine',
    ].join('\r\n')

    const written: string[] = []
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (value: string) => {
          written.push(value)
          return Promise.resolve()
        },
      },
    })

    render(<CodeBlock code={query} language="kql" lineNumbers />)
    await waitFor(() => {
      expect(rendered()).toContain('project')
    })
    // The gutter really is on the page, so the assertion below is not passing
    // because there was nothing to leak.
    expect(rendered()).toContain('4')

    await userEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await waitFor(() => {
      expect(written).toHaveLength(1)
    })
    expect(written[0]).toBe(query)
    expect(written[0]).toContain('\r\n')
    expect(written[0]).not.toMatch(/^1SecurityEvent/)
  })

  it('can be left off', () => {
    render(<CodeBlock code="ls" language="bash" copy={false} />)
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull()
  })
})
