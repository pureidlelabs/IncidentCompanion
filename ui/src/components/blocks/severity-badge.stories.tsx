import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { FieldToneBadge, SeverityBadge, held } from '@/components/blocks/severity-badge'
import specs from '@/fixtures/specs.json'
import type { FieldToneSpec } from '@/api/specs'

/**
 * `SeverityBadge` on the React Aria kit: the served vocabulary, and the values
 * that fall through to `none`.
 *
 * `FieldToneBadge` is the other half and the classification ramp lives on it --
 * hue for how bad, fill for whether anything is wrong here.
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
 *
 * The order is the vocabulary's rather than alphabetical, because the ramp is
 * read as a scale and a scale sorted by name is not one.
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
 *
 * Severity arrives as free text, so an install that calls its worst band
 * `sev-1` gets a chip that says `sev-1` in the neutral tone rather than an
 * unstyled one or nothing at all.
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
 *
 * A ramp that rejected `  HIGH  ` would paint a real high-severity row grey
 * because an exporter added a space.
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
 *
 * A chip with nothing in it is a rendering fault to anybody scanning a column;
 * the word says the row was never given one.
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
 *
 * The alternative reading -- fill means *confirmed* -- was drawn and refused.
 * Under it `suspected` is hollow and `benign` is filled; under this one both
 * swap, so only one of the two can ever be drawn. Fill answers the question an
 * analyst scanning a column of thirty is actually asking.
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
 *
 * `commodity infection` is off the severity ramp on purpose: opportunistic
 * malware really is there, so it fills, but the value exists to say *this is
 * not the intrusion being hunted* -- and on the ramp it would compete with the
 * thing it is meant to be told apart from.
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
 *
 * **`benign` is not the good end.** It means the indicator showed up and has
 * an explanation -- expected traffic, a known scanner, the backup agent -- not
 * that nothing is there. It cost somebody a look and stays on the record as a
 * thing that was judged, so it keeps the yellow and goes hollow.
 *
 * So `suspicious` and `benign` share the yellow honestly: same notability, and
 * fill carries whether anything is wrong. **Whether this vocabulary also wants
 * a `clean` -- nothing was ever here -- is open**; `unknown` is not it, and is
 * grey because grey is the absence of a judgement.
 */
export const Indicator: Story = {
  name: 'disposition -- an indicator',
  render: () => (
    <Field field="disposition" values={['malicious', 'suspicious', 'benign', 'unknown']} />
  ),
}

/**
 * What happened to a body of data, by the leg of the CIA triad it belongs to.
 *
 * **`altered` is the integrity leg and it has no neighbour.** Drop it and the
 * model can say *they took it* and *they broke it* but not *they changed it*,
 * which is what a regulator asks about a financial record. It sits between
 * `accessed` and `destroyed` in degree rather than differing in kind, which
 * was ruled with that stated.
 *
 * **`encrypted` and `destroyed` share a hue deliberately** -- same leg, same
 * weight, and encryption is often the more recoverable of the two. The word
 * carries the difference; the colour must not claim ransomware outranks
 * destruction.
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
 *
 * Both are `--severity-low`. If a hollow chip ever reads as a disabled one,
 * this is the story it shows up in: the outline and the lettering are the
 * role's own colour, never `--border` and never `--ink-muted`.
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
 *
 * Every hollow chip is a place nothing is wrong. The filled ones are the
 * incident and the hollow ones are the work already done.
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
 *
 * Filling these puts a second chip on every row of the Assets table, which is
 * what `ui/src/components/blocks/entity-scope-table.tsx` means by nothing there
 * shouting. A run of filled chips is meant to be the shape of the incident, and
 * it stops being that the moment a workflow state joins in.
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
 *
 * A role this build has no token for and a tone that never arrived are one
 * chip: grey and hollow. Never an unpainted `Badge`, which reads as a
 * rendering failure rather than as an unrated value.
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
