import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'

import {
  DEMO_CANDIDATES,
  DEMO_INCIDENTS,
  DEMO_SOURCES,
  ImportSentinelScreen,
} from './import-sentinel'

/**
 * The four-phase importer, one story per phase.
 *
 * The screen `fills`, so each story mounts it in a pane with a height: the
 * listing scrolls inside the phase body while the step rail and the action row
 * stay put.
 */
const meta = {
  title: 'Screens/Collect/Import incidents',
  component: ImportSentinelScreen,
  parameters: { layout: 'fullscreen' },
  // The screen `fills`, so the wrapper is the viewport: the step rail and the
  // action row stay put while the listing scrolls between them.
  decorators: [
    (Story) => (
      <div className="flex h-dvh flex-col p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    sources: DEMO_SOURCES,
    incidents: DEMO_INCIDENTS,
    candidates: DEMO_CANDIDATES,
  },
} satisfies Meta<typeof ImportSentinelScreen>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The shipped state: no importer is configured, so there is nothing to sign in
 * to.
 *
 * The phase says so rather than drawing a form, and Continue is refused -
 * a form that cannot connect is a promise about a provider this deployment has
 * never been given.
 */
export const NoImporter: Story = { name: 'An install with no importer' }

/**
 * The connection form, on an install that can reach a provider.
 *
 * Empty, because an install being able to reach a provider has not given it
 * anybody's app registration - the two IDs are the analyst's own, and the
 * primary refuses until both are filled.
 */
export const Connect: Story = {
  name: 'Connecting',
  args: { connected: true },
}

/**
 * The same step once the coordinates are set and the sign-in has happened.
 *
 * Two opaque GUIDs are an install's setup, entered once; re-reading them at
 * the start of every import asks the analyst to check something they cannot
 * check, so the step becomes a sentence with a way back to the form.
 */
export const SignedIn: Story = {
  play: async ({ canvas, step }) => {
    await step('the verb is Continue, not Sign in', async () => {
      // "Sign in" over a line reading "Signed in as rin" is the screen
      // contradicting itself about the one thing this phase is for.
      await expect(canvas.getByTestId('import-primary')).toHaveTextContent('Continue')
    })
  },
  name: 'Already signed in',
  args: { connected: true, identity: 'rin.okafor@meridian-logistics.example' },
}

/**
 * The provider refusing the sign-in, in its own words.
 *
 * The message sits above the phase body rather than under a field: the refusal
 * is about the connection, and neither box on the form is the culprit.
 */
export const ConnectRefused: Story = {
  name: 'A connection the provider refused',
  args: {
    connected: true,
    problem: 'The account signed in has no permission to list incidents in that tenant.',
  },
}

/**
 * Four workspaces, two of which share a name.
 *
 * The second line is where each lives, which is the only thing telling them
 * apart - and two of one name is the ordinary case, not the edge one.
 */
export const PickWorkspace: Story = {
  name: 'Picking a workspace',
  args: { connected: true, phase: 'source' },
}

/**
 * A tenant the account can see no workspace in.
 *
 * Empty rather than refused: the sign-in worked, and what it bought was
 * nothing.
 */
export const NoWorkspace: Story = {
  play: async ({ canvas, step }) => {
    await step('nothing can be continued to', async () => {
      // Empty rather than refused: the sign-in worked and bought nothing, so
      // the way on is closed while the way back stays open.
      await expect(canvas.getByTestId('import-primary')).toBeDisabled()
    })
  },
  name: 'No workspace to read from',
  args: { connected: true, phase: 'source', sources: [] },
}

/**
 * Six incidents, with the five dials that compose the query.
 *
 * The dials take effect on Search rather than on the keystroke: they are what
 * the provider is asked for, and a listing that moves while a filter is
 * half-typed claims a query nobody sent.
 */
export const Incidents: Story = {
  name: 'Choosing incidents',
  args: { connected: true, phase: 'incidents' },
}

/**
 * A workspace with no incident in the window at all.
 *
 * The words name the way back - widen the window, drop the dials - rather than
 * reporting zero.
 */
export const NoIncidents: Story = {
  name: 'Nothing in that window',
  args: { connected: true, phase: 'incidents', incidents: [] },
}

/**
 * The review: six rows from two incidents, four new and two merges.
 *
 * The verdict is a chip on every row rather than a count at the top, because
 * `new` writes a row and `merge` changes one the case already holds - and that
 * is the whole of what a reviewer is deciding between.
 */
export const Review: Story = {
  name: 'Reviewing what would be written',
  args: { connected: true, phase: 'review' },
}

/**
 * A review with nothing in it.
 *
 * Every row these incidents carry is already in the case, unchanged - which is
 * a normal answer on a second run and not an error.
 */
export const NothingToAdd: Story = {
  name: 'Nothing to add',
  args: { connected: true, phase: 'review', candidates: [] },
}

/** The detail fetch in flight: the current step's number becomes a spinner. */
export const Busy: Story = {
  name: 'Fetching detail',
  args: { connected: true, phase: 'incidents', busy: true },
}

/**
 * A 520px pane.
 *
 * The step rail wraps, the five dials stack, and the listing scrolls sideways
 * inside its wrapper rather than crushing six columns.
 */
export const Narrow: Story = {
  name: 'A narrow pane',
  render: (args) => (
    <div className="flex h-dvh w-[520px] flex-col border-r border-dashed border-border p-2">
      <ImportSentinelScreen {...args} />
    </div>
  ),
  args: { connected: true, phase: 'incidents' },
}

/** A workspace name, an incident title and a candidate label past their columns. */
export const Overlong: Story = {
  name: 'Values too long for their columns',
  args: {
    connected: true,
    phase: 'review',
    sources: DEMO_SOURCES.map((one, at) =>
      at === 0
        ? { ...one, name: 'meridian-logistics-group-security-operations-primary', detail: 'westeurope - rg-security-operations-primary-workspace' }
        : one,
    ),
    incidents: DEMO_INCIDENTS.map((one, at) =>
      at === 0
        ? {
            ...one,
            title:
              'Ransomware deployment detected on multiple hosts across the finance, HR and directory estate, with staged exfiltration',
          }
        : one,
    ),
    candidates: DEMO_CANDIDATES.map((one, at) =>
      at === 0
        ? {
            ...one,
            label:
              'Ransomware deployment detected on multiple hosts across the finance, HR and directory estate, with staged exfiltration',
          }
        : one,
    ),
  },
}

/**
 * A busy shift: sixty incidents in the window.
 *
 * The listing scrolls between the step rail and the action row, and the count
 * beside the primary is what says how many are carried into the review.
 */
export const Dense: Story = {
  name: 'A shift of incidents',
  args: { connected: true, phase: 'incidents', incidents: manyIncidents() },
  // A listing that drew the first screenful and stopped reads as a quiet
  // shift rather than as a scroller that never arrived.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const rows = await canvas.findAllByRole('row')
    await expect(rows.length).toBeGreaterThan(20)
  },
}

/**
 * A review of everything those incidents would write.
 *
 * The review is the last screen before a write, so it has to stay readable at
 * the length that follows from picking more than a handful.
 */
export const DenseReview: Story = {
  name: 'A review of many rows',
  args: {
    connected: true,
    phase: 'review',
    incidents: manyIncidents(),
    candidates: manyCandidates(),
    selected: manyIncidents().map((one) => one.id),
  },
  // The line above the listing is the claim, and a review that counted what it
  // drew rather than what would be written is the failure it guards.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const summary = await canvas.findByRole('status')
    await expect(summary.textContent).toMatch(/40 new rows and 20 merges, from 20 incidents/)
  },
}

/** The demo's six incidents ten times over, each pass with its own numbers. */
function manyIncidents() {
  return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((pass) =>
    DEMO_INCIDENTS.map((one) => ({
      ...one,
      id: `${one.id}-${String(pass)}`,
      number: `${one.number}${String(pass)}`,
    })),
  )
}

/** What all of them would add, which is the review at its full length. */
function manyCandidates() {
  return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((pass) =>
    DEMO_CANDIDATES.map((one) => ({
      ...one,
      id: `${one.id}-${String(pass)}`,
      incident: `${one.incident}-${String(pass)}`,
    })),
  )
}
