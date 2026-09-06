import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import type { Case } from '@/api/model'
import { campaignCase } from '@/fixtures/campaign'

import { CaseArchiveScreen } from './case-archive'
import { inACase } from '@/fixtures/in-a-case'

/** Every table emptied, which is a case created and not yet worked. */
const EMPTY: Case = {
  ...campaignCase,
  timeline: [],
  systems: [],
  accounts: [],
  networkIndicators: [],
  malware: [],
  cloudApps: [],
  impact: [],
  evidence: [],
  actions: [],
  casenotes: [],
  reports: [],
  reportBlocks: [],
}

/**
 * The case, out, as one file.
 *
 * The count under the title is summed from the case document rather than
 * served: nothing publishes an archive inventory.
 */
const meta = {
  title: 'Screens/Report/Case archive',
  component: CaseArchiveScreen,
  decorators: [inACase('archive')],
  parameters: { layout: 'fullscreen' },
  args: {
    kase: campaignCase,
  },
} satisfies Meta<typeof CaseArchiveScreen>

export default meta
type Story = StoryObj<typeof meta>

/** The campaign demo, with the export unencrypted until a passphrase is typed. */
export const Populated: Story = { name: 'A case with records in it' }

/**
 * A passphrase typed into both boxes.
 *
 * The footnote changes with it, so the one consequence an analyst cannot see
 * from the form - whether the file that lands is encrypted - is stated beside
 * the control that decides it.
 */
export const Encrypted: Story = {
  name: 'A passphrase set',
  args: { passphrase: 'correct-horse-battery-staple', confirm: 'correct-horse-battery-staple' },
}

/**
 * The two passphrases disagreeing.
 *
 * The export is refused here rather than on the server: a mistyped passphrase
 * produces an archive nobody can ever open.
 */
export const Mismatch: Story = {
  name: 'The passphrases disagree',
  args: {
    passphrase: 'correct-horse-battery-staple',
    confirm: 'correct-horse-batery-staple',
    // Wired on purpose: `isDisabled` is also true without a handler, so an
    // unwired story would refuse the control for a reason that is not the
    // mismatch and say nothing about the passphrases.
    onExport: fn(),
  },
  play: async ({ canvas, step }) => {
    await step('the export is refused here, not sent to be refused there', async () => {
      // A mistyped passphrase produces an archive nobody can ever open, and
      // the server cannot tell a typo from a choice -- so this is one of the
      // few refusals that has to happen before the request.
      await expect(canvas.getByRole('button', { name: /Export archive/ })).toBeDisabled()
    })
  },
}

/**
 * The server refusing the passphrase.
 *
 * The shortest one is a server constant that is not on the wire, so this
 * message is the only place the number is ever stated.
 */
export const Refused: Story = {
  name: 'An export the server refused',
  args: {
    passphrase: 'short',
    confirm: 'short',
    refusal: 'An archive passphrase is at least 12 characters.',
  },
  play: async ({ canvas, step }) => {
    await step('the refusal states the length', async () => {
      // The shortest passphrase is a server constant that never reaches the
      // client, so this message is the only place the number is ever said.
      await expect(
        canvas.getByText('An archive passphrase is at least 12 characters.'),
      ).toBeVisible()
    })
    await step('and the screen adds no refusal of its own', async () => {
      // These two match. The server refused them for being short, which is a
      // different thing from the screen refusing them for disagreeing.
      await expect(canvas.queryByText(/do not match/i)).toBeNull()
    })
  },
}

/** A passphrase long enough for the server, shared by the stories that export. */
const PASSPHRASE = 'correct-horse-battery-staple'

/**
 * The export pressed, with the passphrase that was typed.
 *
 * Nothing on this screen shows what left it: the button changes its own label
 * and the footnote is written from the box rather than from the export. So a
 * screen that sent an empty passphrase would say the archive is encrypted and
 * write one that is not.
 */
export const Exported: Story = {
  name: 'An export sent',
  args: { passphrase: PASSPHRASE, confirm: PASSPHRASE, onExport: fn() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: /export archive/i }))
    await expect(args.onExport).toHaveBeenCalledOnce()
    await expect(args.onExport).toHaveBeenCalledWith({ passphrase: PASSPHRASE, files: true })
  },
}

/**
 * The same export with the attachments left out.
 *
 * The tick is the whole difference between a backup and a handover, and it
 * changes nothing else on the screen.
 */
export const ExportedWithoutFiles: Story = {
  name: 'An export without the attachments',
  args: { passphrase: PASSPHRASE, confirm: PASSPHRASE, onExport: fn() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('checkbox', { name: /include attached files/i }))
    await userEvent.click(await canvas.findByRole('button', { name: /export archive/i }))
    await expect(args.onExport).toHaveBeenCalledWith({ passphrase: PASSPHRASE, files: false })
  },
}

/**
 * An export with no passphrase at all, which the footnote says leaves the
 * archive unencrypted.
 *
 * The empty passphrase has to travel as the empty string rather than as the
 * box being ignored: what the analyst was told and what is written have to be
 * the same decision.
 */
export const ExportedUnencrypted: Story = {
  name: 'An export left unencrypted',
  args: { onExport: fn() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('The archive leaves unencrypted.')).toBeVisible()
    await userEvent.click(await canvas.findByRole('button', { name: /export archive/i }))
    await expect(args.onExport).toHaveBeenCalledWith({ passphrase: '', files: true })
  },
}

/** The export running: the label is swapped and the button keeps its width. */
export const Busy: Story = {
  name: 'Exporting',
  args: { passphrase: 'correct-horse-battery-staple', confirm: 'correct-horse-battery-staple', exporting: true },
}

/**
 * A case with nothing in it.
 *
 * The count is zero, the warning says what an archive of it would carry, and
 * the export is refused - a file with no records is not a handover.
 */
export const Empty: Story = {
  name: 'A case with nothing in it',
  args: { kase: EMPTY },
}

/** A 420px pane: the two passphrase fields stack rather than sharing a row. */
export const Narrow: Story = {
  name: 'A narrow pane',
  render: (args) => (
    <div className="w-[420px] border border-dashed border-border p-2">
      <CaseArchiveScreen {...args} />
    </div>
  ),
}

/** A refusal long enough to wrap to three lines above the form. */
export const Overlong: Story = {
  name: 'A refusal too long for one line',
  args: {
    passphrase: 'short',
    confirm: 'short',
    refusal:
      'An archive passphrase is at least 12 characters. This install refuses a shorter one rather than accepting it, because an archive that leaves the building is the one file nobody can re-encrypt afterwards.',
  },
}
