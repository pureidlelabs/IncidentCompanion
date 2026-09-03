import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'

import { Button } from '@/components/ui/button'
import { AboutDialog } from './about-dialog'

const FACTS = {
  version: 'internal-dev',
  license: 'AGPL-3.0-only',
  copyright: '© 2026 Boudewijn van Silfhout',
  siteUrl: 'https://incidentcompanion.com',
  makerUrl: 'https://pureidle.dev',
  repoUrl: 'https://github.com/pureidlelabs/IncidentCompanion',
  issuesUrl: 'https://github.com/pureidlelabs/IncidentCompanion/issues',
}

/**
 * What this build is, opened from either rail's menu.
 *
 * The facts are args; `AboutContainer` is what reads them from the server.
 */
const meta = {
  title: 'Blocks/Dialogs/About',
  component: AboutDialog,
  parameters: { layout: 'fullscreen' },
  args: {
    // Shut by default, and a story turns it on: a docs page renders every
    // story into one document, and modal dialogs there cannot be dismissed.
    isOpen: false,
    onOpenChange: fn(),
    about: FACTS,
  },
  decorators: [
    /** Holds the dialog open, which nothing else here does. */
    (Story, context) => {
      const [open, setOpen] = useState(context.parameters.startOpen === true)
      return (
        <>
          <Button
            variant="outline"
            onPress={() => {
              setOpen(true)
            }}
          >
            About this install
          </Button>
          <Story args={{ ...context.args, isOpen: open, onOpenChange: setOpen }} />
        </>
      )
    },
  ],
} satisfies Meta<typeof AboutDialog>

export default meta
type Story = StoryObj<typeof meta>


/**
 * Opens the dialog the way an analyst does, and hands back its body.
 *
 * The dialog portals out of the story's element, so it is found on the
 * document rather than on the canvas.
 */
async function opened(canvasElement: HTMLElement) {
  const canvas = within(canvasElement)
  const screen = within(canvasElement.ownerDocument.body)
  const dialogs = () =>
    screen
      .queryAllByRole('dialog', { name: 'About this install' })
      .filter((el) => el.checkVisibility() && el.getBoundingClientRect().height > 0)

  // **Waits for the page to be clear before opening anything.** This file's
  // earlier story leaves its dialog in the document while it animates out --
  // visible, emptied, and answering to the same name. Opening on top of that
  // leaves two, and which one a query returns is then a race; waiting for
  // none first means the one that follows is this story's.
  await waitFor(() => {
    if (dialogs().length !== 0) throw new Error('an earlier dialog is still leaving')
  })

  await userEvent.click(canvas.getByRole('button', { name: 'About this install' }))

  // The last visible one. Stories share a page, and a dialog left over from
  // an earlier story stays in the document while it animates out -- so a
  // single-match query answers with a copy that is on its way off screen,
  // and only in the order that story happened to run first.
  // Found by its own name rather than taken as the last visible dialog.
  // Stories share a page: one left over from an earlier story stays in the
  // document while it animates out, so "the last dialog" belongs to whichever
  // story is still leaving, and this one then reads somebody else's content
  // in an order that depends on which files the run included.
  //
  // Waited for, because it animates in as well: the content is in the
  // document a frame before it is painted, and an assertion made in that
  // frame fails on an element about to be perfectly visible.
  let live: HTMLElement | undefined
  await waitFor(() => {
    // By name, so another story's dialog is never mistaken for this one; and
    // the last visible of those, because this file's own earlier story leaves
    // one in the document while it animates out -- emptied, so an assertion
    // against it fails on a blank element rather than on missing content.
    const shown = dialogs()
    if (shown.length !== 1) {
      throw new Error(`waiting for one About dialog, found ${String(shown.length)}`)
    }
    live = shown[0]!
  })
  return within(live!)
}

/**
 * Dismiss whatever this story opened, and wait until it has gone.
 *
 * A story that leaves its dialog standing is the thing the next one has to
 * wait out, and while both are on the page which one a query answers with is
 * a race. Closing here is cheaper than every later story defending itself.
 */
async function closed(canvasElement: HTMLElement) {
  const screen = within(canvasElement.ownerDocument.body)
  await userEvent.keyboard('{Escape}')
  await waitFor(() => {
    const left = screen
      .queryAllByRole('dialog', { name: 'About this install' })
      .filter((el) => el.checkVisibility() && el.getBoundingClientRect().height > 0)
    if (left.length !== 0) throw new Error('the About dialog is still on screen')
  })
}

/** The six facts, as an analyst reads them. Press the trigger to open it. */
export const Open: Story = {
  play: async ({ canvasElement, step }) => {
    const dialog = await opened(canvasElement)

    await step('the build is named, and the licence with it', async () => {
      // What this install *is* is the whole reason the dialog exists: the
      // version is what an operator quotes in a bug report, and the licence
      // is what the AGPL obliges the install to state.
      //
      // Re-queried inside the wait rather than matched once and asserted on
      // after. The body mounts before the facts reach it, so the element
      // holding the version is emptied and refilled under the assertion --
      // and what fails is then a blank span rather than a missing version.
      await waitFor(async () => {
        await expect(dialog.getByText(FACTS.version)).toBeVisible()
      })

      // Twice: once in the licence link, once in the warranty sentence.
      // Both read the served value; neither carries its own copy.
      await expect(dialog.getAllByText(new RegExp(FACTS.license)).length).toBeGreaterThan(1)
      await expect(dialog.getByText(FACTS.copyright)).toBeVisible()
    })

    await step('and a link goes where its row says', async () => {
      // Named by the address it shows rather than by its row's label, which
      // is what a screen reader reads out of the list. A row naming a
      // destination and linking somewhere else is worse than no link.
      await expect(
        dialog.getByRole('link', { name: FACTS.issuesUrl.replace('https://github.com/', '') }),
      ).toHaveAttribute('href', FACTS.issuesUrl)
    })

    await closed(canvasElement)
  },
}

/** Still reading, which is what the first press shows. */
export const Reading: Story = {
  args: { about: undefined, busy: true },
  play: async ({ canvasElement }) => {
    const dialog = await opened(canvasElement)

    // Nothing is stated about the install while the read is in flight. A
    // dialog drawing empty rows would name a licence it does not know.
    await expect(dialog.queryByText(FACTS.license)).toBeNull()
    await expect(dialog.queryByText(FACTS.version)).toBeNull()

    await closed(canvasElement)
  },
}

/** The route refused, and the dialog says so rather than drawing nothing. */
export const Refused: Story = {
  args: { about: undefined, problem: new Error('The install could not be read.') },
  play: async ({ canvasElement }) => {
    const dialog = await opened(canvasElement)

    // A dialog that opened empty would read as an install with no licence and
    // no version, which is a different claim from one it could not read. The
    // boundary draws the message more than once; the visible one is the copy
    // on the screen rather than the one it announces.
    const said = dialog.getAllByText(/could not be read/).filter((el) => el.checkVisibility())
    await expect(said.length).toBeGreaterThan(0)

    await closed(canvasElement)
  },
}
