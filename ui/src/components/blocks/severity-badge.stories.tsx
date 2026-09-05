import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { FieldToneBadge, SeverityBadge, held } from '@/components/blocks/severity-badge'
import specs from '@/fixtures/specs.json'
import type { FieldToneSpec } from '@/api/specs'

/**
 * `SeverityBadge` on the React Aria kit: the served vocabulary, and the values
 * that fall through to `none`.
 */
const meta = {
  title: 'Blocks/Badge/Severity',
  component: SeverityBadge,
  parameters: { layout: 'padded' },
  args: { severity: 'critical' },
} satisfies Meta<typeof SeverityBadge>

export default meta
type Story = StoryObj<typeof meta>

const SERVED = ['critical', 'high', 'medium', 'low', 'informational'] as const

/** The served map, read rather than restated -- these stories draw what ships. */
const TONES = specs.field_tones as Record<string, Record<string, FieldToneSpec>>

function Line({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-44">{children}</span>
      {note !== undefined && <span className="text-2xs text-ink-muted">{note}</span>}
    </div>
  )
}

/** Every value of one served field, in the order the vocabulary declares. */
function Field({ field, values }: { field: string; values: readonly string[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-mono text-2xs uppercase tracking-micro text-ink-muted">{field}</h3>
      {values.map((value) => (
        <FieldToneBadge key={value} value={value} tone={TONES[field]?.[value]} />
      ))}
    </div>
  )
}

/**
 * The five words the ramp is drawn for, in the order the vocabulary declares.
 */
export const TheRamp: Story = {
  name: 'The served vocabulary',
  play: async ({ canvas }) => {
    for (const word of SERVED) {
      await expect(canvas.getByText(word)).toBeVisible()
    }
  },
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {SERVED.map((s) => (
        <SeverityBadge key={s} severity={s} />
      ))}
    </div>
  ),
}

/**
 * A word the ramp does not know is drawn, not dropped.
 */
export const Unrecognised: Story = {
  name: 'A word outside the vocabulary falls through to none',
  play: async ({ canvas }) => {
    // The word survives; only the tone falls through.
    await expect(canvas.getByText('catastrophic')).toBeVisible()
    await expect(canvas.getByText('sev-1')).toBeVisible()
  },
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <SeverityBadge severity="catastrophic" />
      <SeverityBadge severity="sev-1" />
    </div>
  ),
}

/**
 * Case and surrounding space are normalised on the way to the tone, and the
 * word is drawn as it was sent.
 */
export const Normalised: Story = {
  name: 'Case and surrounding space are normalised, not rejected',
  play: async ({ canvasElement }) => {
    const chips = [...canvasElement.querySelectorAll('[data-slot="badge"]')]
    await expect(chips).toHaveLength(2)
    // Read as exact text: `getByText` trims on the reader's behalf, so it
    // matches whether or not the chip did.
    await expect(chips.map((c) => c.textContent)).toEqual(['HIGH', 'Medium'])
  },
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <SeverityBadge severity="  HIGH  " />
      <SeverityBadge severity="Medium" />
    </div>
  ),
}

/**
 * An empty severity reads `unset` rather than drawing an empty chip.
 */
export const NoValue: Story = {
  name: 'An empty severity reads unset',
  play: async ({ canvas }) => {
    await expect(canvas.getByText('unset')).toBeVisible()
  },
  render: () => <SeverityBadge severity="" />,
}

/**
 * **Two axes. Hue carries how bad; fill carries whether anything is wrong.**
 */
export const TwoAxes: Story = {
  name: 'Hue is how bad, fill is whether anything is wrong',
  render: () => (
    <div className="flex flex-col gap-3">
      <Line note="the actor is in this host">
        <FieldToneBadge value="compromised" tone={TONES.verdict?.compromised} />
      </Line>
      <Line note="might be">
        <FieldToneBadge value="suspected" tone={TONES.verdict?.suspected} />
      </Line>
      <Line note="hollow: assessed, and nothing is wrong here">
        <FieldToneBadge value="clean" tone={TONES.verdict?.clean} />
      </Line>
    </div>
  ),
}

/**
 * A host's verdict.
 */
export const Verdict: Story = {
  name: 'verdict -- a host',
  render: () => (
    <Field
      field="verdict"
      values={['compromised', 'accessed', 'suspected', 'commodity infection', 'clean', 'unknown']}
    />
  ),
}

/**
 * An indicator's disposition, and the pair that shares one hue.
 */
export const Indicator: Story = {
  name: 'disposition -- an indicator',
  render: () => (
    <Field field="disposition" values={['malicious', 'suspicious', 'benign', 'unknown']} />
  ),
}

/**
 * What happened to a body of data, by the leg of the CIA triad it belongs to.
 */
export const Impact: Story = {
  name: 'disposition -- impact on data',
  render: () => (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h3 className="font-mono text-2xs uppercase tracking-micro text-ink-muted">
          Confidentiality
        </h3>
        <Line note="it left">
          <FieldToneBadge value="exfiltrated" tone={TONES.disposition?.exfiltrated} />
        </Line>
        <Line note="it was read">
          <FieldToneBadge value="accessed" tone={TONES.disposition?.accessed} />
        </Line>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="font-mono text-2xs uppercase tracking-micro text-ink-muted">Availability</h3>
        <Line note="gone">
          <FieldToneBadge value="destroyed" tone={TONES.disposition?.destroyed} />
        </Line>
        <Line note="ransomware -- same leg, same weight">
          <FieldToneBadge value="encrypted" tone={TONES.disposition?.encrypted} />
        </Line>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="font-mono text-2xs uppercase tracking-micro text-ink-muted">Integrity</h3>
        <Line note="it was changed -- the leg that has no other value">
          <FieldToneBadge value="altered" tone={TONES.disposition?.altered} />
        </Line>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="font-mono text-2xs uppercase tracking-micro text-ink-muted">
          Nothing happened
        </h3>
        <Line note="assessed, and nothing happened">
          <FieldToneBadge value="untouched" tone={TONES.disposition?.untouched} />
        </Line>
        <Line note="nobody has established which -- grey is the absence of a judgement">
          <FieldToneBadge value="unknown" tone={TONES.disposition?.unknown} />
        </Line>
      </div>
    </div>
  ),
}

/**
 * The pair fill exists to separate, at the smallest size the kit ships.
 */
export const OneHueTwoAnswers: Story = {
  name: 'Two chips of one hue, separated only by fill',
  render: () => (
    <div className="flex items-center gap-3">
      <FieldToneBadge value="suspicious" tone={TONES.disposition?.suspicious} />
      <FieldToneBadge value="benign" tone={TONES.disposition?.benign} />
      <span className="text-2xs text-ink-muted">-- and a disabled-looking chip is neither</span>
    </div>
  ),
}

/**
 * `isolated` is not a classification. It is a boolean with an `isolatedAt`
 * stamp, and it draws beside whatever the verdict is.
 */
export const Isolated: Story = {
  name: 'Isolated, beside a verdict',
  render: () => (
    <div className="flex items-center gap-3">
      <FieldToneBadge value="compromised" tone={TONES.verdict?.compromised} />
      <FieldToneBadge value="isolated" tone={TONES.isolated?.true} />
    </div>
  ),
}

/**
 * Down a column, which is the only place a ramp is judged.
 */
export const DownAColumn: Story = {
  name: 'Down a column of hosts',
  render: () => {
    const rows: [string, string][] = [
      ['WKS-FIN01', 'compromised'],
      ['DC-01', 'compromised'],
      ['FS-01', 'accessed'],
      ['FS-02', 'suspected'],
      ['WKS-HR03', 'clean'],
      ['WKS-HR04', 'suspected'],
      ['BKP-01', 'accessed'],
      ['WKS-ENG02', 'clean'],
      ['SVC-SQL', 'commodity infection'],
      ['WKS-SALES01', 'clean'],
    ]
    return (
      <div className="flex flex-col gap-1.5 font-mono text-xs">
        {rows.map(([host, verdict]) => (
          <div key={host} className="flex items-center gap-4">
            <span className="w-32 text-ink">{host}</span>
            <FieldToneBadge value={verdict} tone={TONES.verdict?.[verdict]} />
          </div>
        ))}
      </div>
    )
  },
}

/**
 * A lifecycle is never adverse, so it never fills.
 */
export const Lifecycle: Story = {
  name: 'A lifecycle never fills',
  render: () => (
    <div className="flex flex-col gap-5">
      <Field field="analysis_status" values={['in progress', 'completed']} />
      <Field field="triage" values={['untriaged', 'investigating', 'assessed']} />
    </div>
  ),
}

/**
 * What the component does with the answers it is not given.
 */
export const Fallthrough: Story = {
  name: 'An unmapped value, and a hue this build cannot paint',
  render: () => (
    <div className="flex flex-col gap-3">
      <Line note="no served tone at all">
        <FieldToneBadge value="something new" tone={undefined} />
      </Line>
      <Line note="a role this build has no token for">
        <FieldToneBadge value="a hue from a newer server" tone={held('chartreuse', 'solid')} />
      </Line>
    </div>
  ),
}
