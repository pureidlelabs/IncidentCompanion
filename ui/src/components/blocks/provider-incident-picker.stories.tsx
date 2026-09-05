import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import {
  NO_DIALS,
  ProviderIncidentPicker,
  type RemoteIncident,
} from '@/components/blocks/provider-incident-picker'

/** Six demo incidents, deliberately not in date order. */
const INCIDENTS: readonly RemoteIncident[] = [
  {
    id: 'INC-88214',
    number: '88214',
    title: 'Ransomware deployment detected on multiple hosts',
    severity: 'High',
    status: 'Active',
    created: '2026-08-24 09:14 UTC',
  },
  {
    id: 'INC-88190',
    number: '88190',
    title: 'Suspicious sign-in from an unfamiliar location',
    severity: 'Medium',
    status: 'Active',
    created: '2026-08-25 04:02 UTC',
  },
  {
    id: 'INC-88155',
    number: '88155',
    title: 'Mass file rename by a single account',
    severity: 'High',
    status: 'New',
    created: '2026-08-20 11:40 UTC',
  },
]

/**
 * The importer's incident step: the five dials that compose the query, and
 * the listing they take effect on Search.
 */
const meta = {
  title: 'Blocks/Table/Provider incident picker',
  component: ProviderIncidentPicker,
  parameters: { layout: 'padded' },
  args: {
    incidents: INCIDENTS,
    // More exist than came back, which is the ordinary case and the only one
    // that tells the two numbers apart.
    total: 42,
    dials: NO_DIALS,
    warning: '',
    selected: [],
    onDials: () => undefined,
    onSearch: () => undefined,
    onSelected: () => undefined,
  },
} satisfies Meta<typeof ProviderIncidentPicker>

export default meta
type Story = StoryObj<typeof meta>

/**
 * What the provider returned for the window the dials describe.
 */
export const Default: Story = {
  name: 'Six incidents in the window',
  play: async ({ canvas, args }) => {
    await expect(
      canvas.getByText(
        `${String(args.incidents.length)} of ${String(args.total)} incident(s), 0 selected.`,
      ),
    ).toBeVisible()
  },
}

/**
 * Nothing in that window, which is an answer rather than a failure.
 */
export const Empty: Story = {
  name: 'Nothing in that window',
  args: { incidents: [], total: 0 },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('0 of 0 incident(s), 0 selected.')).toBeVisible()
    // The dials survive the empty result.
    await expect(canvas.getAllByRole('button').length).toBeGreaterThan(0)
  },
}

/**
 * A filter the provider would not take, said on the control that carries it.
 */
export const RefusedFilter: Story = {
  play: async ({ canvas, args }) => {
    // Said on the control that carries the filter, not as a page-level error:
    // the rest of the query ran, and this is the one dial to fix.
    await expect(canvas.getByText(args.warning)).toBeVisible()
  },
  name: 'A non-numeric incident id, refused',
  args: {
    dials: { ...NO_DIALS, number: 'INC-88214' },
    warning: 'Incident ID must be a number; ignoring that filter',
  },
}

/**
 * Two ticked, counted in the same line as the rest.
 */
export const SomeSelected: Story = {
  name: 'Two incidents ticked',
  args: { selected: ['INC-88214', 'INC-88155'] },
  play: async ({ canvas, args }) => {
    await expect(
      canvas.getByText(
        `${String(args.incidents.length)} of ${String(args.total)} incident(s), `
        + `${String(args.selected.length)} selected.`,
      ),
    ).toBeVisible()
  },
}
