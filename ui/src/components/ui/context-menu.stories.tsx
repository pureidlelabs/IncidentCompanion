import type { Meta, StoryObj } from '@storybook/react-vite'
import { Copy, Download, Eye, Flag, Link2, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import {
  ContextMenuTarget,
  ContextMenuTrigger,
  PointerContextMenu,
  type PointerAt,
} from './context-menu'
import {
  Menu,
  MenuCheckboxItem,
  MenuItem,
  MenuItemDetail,
  MenuLabel,
  MenuRadioItem,
  MenuSectionGroup,
  MenuSeparator,
  MenuShortcut,
  SubmenuTrigger,
} from './menu'

/** The menu a right click, a long press or the platform's context-menu key opens on a target. */
const meta = {
  title: 'Components/ContextMenu',
  component: ContextMenuTrigger,
  parameters: { layout: 'centered' },
  args: { children: null },
} satisfies Meta<typeof ContextMenuTrigger>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The menu that is on screen now, once it has finished arriving.
 */
async function liveMenu(canvasElement: HTMLElement) {
  const screen = within(canvasElement.ownerDocument.body)
  let live: HTMLElement | undefined
  await waitFor(() => {
    live = screen.queryAllByRole('menu').filter((el) => el.checkVisibility()).at(-1)
    if (live === undefined) throw new Error('no menu on screen')
    if (live.getBoundingClientRect().height === 0) throw new Error('still arriving')
  })
  return live!
}

/**
 * Its own docs frame, `height` tall.
 */
function frame(height: string) {
  return { docs: { story: { inline: false, height } } }
}

/**
 * Right click the region, long press it on touch, or press the context-menu
 * key.
 */
export const Closed: Story = {
  render: () => (
    <ContextMenuTrigger>
      <ContextMenuTarget variant="dashed" className="w-64">
        Right click this artefact
      </ContextMenuTarget>
      <Menu aria-label="Artefact actions">
        <MenuItem>
          <Pencil />
          Rename
        </MenuItem>
        <MenuItem>
          <Copy />
          Copy hash
        </MenuItem>
        <MenuItem>
          <Download />
          Download
        </MenuItem>
      </Menu>
    </ContextMenuTrigger>
  ),
}

/** Open on mount, with no pointer to position it: the menu falls back to the target. */
export const Open: Story = {
  parameters: frame('220px'),
  play: async ({ canvasElement }) => {
    const menu = within(await liveMenu(canvasElement))

    // Every row is a menu item rather than a button in a box: what a menu is
    // to assistive technology is the roles, not the shape it draws.
    await expect(menu.getAllByRole('menuitem')).toHaveLength(2)
    await expect(menu.getByRole('menuitem', { name: /Open/ })).toBeVisible()

    // The shortcut travels with the row it belongs to, so a reader hears the
    // key beside the action rather than as a column of loose text.
    await expect(menu.getByRole('menuitem', { name: /Copy hash/ })).toHaveTextContent('Ctrl C')
  },
  render: () => (
    <ContextMenuTrigger defaultOpen>
      <ContextMenuTarget variant="outline" className="w-64">
        invoice.xlsm
      </ContextMenuTarget>
      <Menu aria-label="Artefact actions">
        <MenuItem>
          Open
          <MenuShortcut>Enter</MenuShortcut>
        </MenuItem>
        <MenuItem>
          Copy hash
          <MenuShortcut>Ctrl C</MenuShortcut>
        </MenuItem>
      </Menu>
    </ContextMenuTrigger>
  ),
}

/** Sections, each with a heading that is not focusable. */
export const Sections: Story = {
  parameters: frame('420px'),
  play: async ({ canvasElement, step }) => {
    const box = await liveMenu(canvasElement)
    const menu = within(box)

    await step('each section is named', async () => {
      await expect(menu.getByText('Entry')).toBeVisible()
      await expect(menu.getByText('Report')).toBeVisible()
    })

    await step('and the arrow keys never land on a heading', async () => {
      // A heading that takes focus is a row the keyboard stops at and nothing
      // happens on -- which reads as a broken item rather than as a label.
      await expect(menu.getAllByRole('menuitem')).toHaveLength(4)

      await userEvent.keyboard('{ArrowDown}')
      await expect(box.ownerDocument.activeElement).toHaveAttribute('role', 'menuitem')

      for (let step = 0; step < 4; step += 1) {
        await userEvent.keyboard('{ArrowDown}')
        await expect(box.ownerDocument.activeElement).toHaveAttribute('role', 'menuitem')
      }
    })
  },
  render: () => (
    <ContextMenuTrigger defaultOpen>
      <ContextMenuTarget variant="outline" className="w-64">
        Timeline entry
      </ContextMenuTarget>
      <Menu aria-label="Timeline entry actions">
        <MenuSectionGroup title="Entry">
          <MenuItem id="edit">Edit</MenuItem>
          <MenuItem id="duplicate">Duplicate</MenuItem>
        </MenuSectionGroup>
        <MenuSectionGroup title="Report">
          <MenuItem id="include">Include in the report</MenuItem>
          <MenuItem id="pin">Pin to the summary</MenuItem>
        </MenuSectionGroup>
      </Menu>
    </ContextMenuTrigger>
  ),
}

/** A destructive row takes its tone only once focused. */
export const Destructive: Story = {
  parameters: frame('220px'),
  render: () => (
    <ContextMenuTrigger defaultOpen>
      <ContextMenuTarget variant="outline" className="w-64">
        Credential dumping on DC01
      </ContextMenuTarget>
      <Menu aria-label="Finding actions">
        <MenuItem>
          <Pencil />
          Edit
        </MenuItem>
        <MenuItem tone="destructive">
          <Trash2 />
          Delete finding
        </MenuItem>
      </Menu>
    </ContextMenuTrigger>
  ),
}

/** The three chromes a target can take. Right click any of them. */
export const Targets: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {(['plain', 'outline', 'dashed'] as const).map((variant) => (
        <ContextMenuTrigger key={variant}>
          <ContextMenuTarget variant={variant} className="w-64">
            {variant}
          </ContextMenuTarget>
          <Menu aria-label={`${variant} actions`}>
            <MenuItem>Open</MenuItem>
            <MenuItem>Copy hash</MenuItem>
          </Menu>
        </ContextMenuTrigger>
      ))}
    </div>
  ),
  /**
   * Every chrome clears the 24px target floor, `plain` included.
   */
  play: async ({ canvasElement }) => {
    const targets = [...canvasElement.querySelectorAll('[data-slot="context-menu-target"]')]
    await expect(targets).toHaveLength(3)
    for (const el of targets) {
      await expect(
        el.getBoundingClientRect().height,
        `the ${el.textContent} target is below the 24px floor`,
      ).toBeGreaterThanOrEqual(24)
    }
  },
}

/** A submenu opened from a context menu row. */
export const Submenu: Story = {
  parameters: frame('220px'),
  render: () => (
    <ContextMenuTrigger defaultOpen>
      <ContextMenuTarget variant="outline" className="w-64">
        DC01
      </ContextMenuTarget>
      <Menu aria-label="Host actions">
        <MenuItem>
          <Eye />
          Open host
        </MenuItem>
        <SubmenuTrigger>
          <MenuItem>
            <Flag />
            Mark as
          </MenuItem>
          <Menu aria-label="Mark as" selectionMode="single" defaultSelectedKeys={['compromised']}>
            <MenuItem id="compromised">Compromised</MenuItem>
            <MenuItem id="clean">Clean</MenuItem>
            <MenuItem id="unknown">Unknown</MenuItem>
          </Menu>
        </SubmenuTrigger>
      </Menu>
    </ContextMenuTrigger>
  ),
}

/** Checkbox and radio rows inside a context menu, each scoped to its own section. */
export const Selection: Story = {
  parameters: frame('500px'),
  play: async ({ canvasElement, step }) => {
    const menu = within(await liveMenu(canvasElement))

    await step('the two kinds of row announce as what they are', async () => {
      // A tick and a dot look alike at a glance and mean different things: one
      // is a set, the other is a choice. Only the role says which.
      await expect(menu.getAllByRole('menuitemcheckbox')).toHaveLength(2)
      await expect(menu.getAllByRole('menuitemradio')).toHaveLength(3)
    })

    await step('and each is scoped to its own section', async () => {
      // Selection lives on the section rather than the menu, so picking a
      // scale does not clear what is shown. One menu-wide selection would
      // make the two lists fight over the same state.
      await expect(menu.getByRole('menuitemcheckbox', { name: 'Evidence links' })).toBeChecked()
      await userEvent.click(menu.getByRole('menuitemradio', { name: 'Days' }))
      await expect(menu.getByRole('menuitemcheckbox', { name: 'Evidence links' })).toBeChecked()
    })
  },
  render: () => (
    <ContextMenuTrigger defaultOpen>
      <ContextMenuTarget variant="outline" className="w-64">
        Timeline
      </ContextMenuTarget>
      <Menu aria-label="Timeline view">
        <MenuSectionGroup title="Show" selectionMode="multiple" defaultSelectedKeys={['evidence']}>
          <MenuCheckboxItem id="evidence">Evidence links</MenuCheckboxItem>
          <MenuCheckboxItem id="system">System events</MenuCheckboxItem>
        </MenuSectionGroup>
        <MenuSeparator />
        <MenuSectionGroup title="Scale" selectionMode="single" defaultSelectedKeys={['hours']}>
          <MenuRadioItem id="minutes">Minutes</MenuRadioItem>
          <MenuRadioItem id="hours">Hours</MenuRadioItem>
          <MenuRadioItem id="days">Days</MenuRadioItem>
        </MenuSectionGroup>
      </Menu>
    </ContextMenuTrigger>
  ),
}

/** Everything the context menu can carry, on one artefact. */
export const Everything: Story = {
  parameters: frame('760px'),
  play: async ({ canvasElement }) => {
    const menu = within(await liveMenu(canvasElement))

    // A row the install cannot run is drawn and refused rather than dropped:
    // an action that vanishes says the artefact does not have it.
    await expect(menu.getByRole('menuitem', { name: 'Reanalyse' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )

    // And the label at the top is not one of them -- it names what the menu
    // is about, and a reader tabbing the rows must not stop on it.
    await expect(menu.getByText('invoice.xlsm')).not.toHaveAttribute('role', 'menuitem')
  },
  render: () => (
    <ContextMenuTrigger defaultOpen>
      <ContextMenuTarget variant="dashed" className="w-64">
        invoice.xlsm
      </ContextMenuTarget>
      <Menu aria-label="Artefact" disabledKeys={['reanalyse']} className="min-w-56">
        <MenuLabel>invoice.xlsm</MenuLabel>
        <MenuSeparator />
        <MenuItem>
          <Pencil />
          Rename
          <MenuShortcut>F2</MenuShortcut>
        </MenuItem>
        <MenuItem>
          <Copy />
          Copy hash
          <MenuShortcut>Ctrl C</MenuShortcut>
        </MenuItem>
        <MenuItem>
          <Link2 />
          Link to entry
          <MenuItemDetail>2 linked</MenuItemDetail>
        </MenuItem>
        <SubmenuTrigger>
          <MenuItem>
            <Download />
            Download as
          </MenuItem>
          <Menu aria-label="Download as">
            <MenuItem>Original</MenuItem>
            <MenuItem>Password-protected zip</MenuItem>
          </Menu>
        </SubmenuTrigger>
        <MenuSeparator />
        <MenuSectionGroup title="Verdict" selectionMode="single" defaultSelectedKeys={['malicious']}>
          <MenuRadioItem id="malicious">Malicious</MenuRadioItem>
          <MenuRadioItem id="suspicious">Suspicious</MenuRadioItem>
          <MenuRadioItem id="benign">Benign</MenuRadioItem>
        </MenuSectionGroup>
        <MenuSeparator />
        <MenuItem id="reanalyse" inset>
          Reanalyse
        </MenuItem>
        <MenuItem tone="destructive">
          <Trash2 />
          Remove artefact
          <MenuShortcut>Del</MenuShortcut>
        </MenuItem>
      </Menu>
    </ContextMenuTrigger>
  ),
}

/**
 * A context menu is the one control with nothing on screen saying it is one.
 */
export const Affordance: Story = {
  render: () => (
    <div className="flex gap-4">
      <ContextMenuTrigger>
        <ContextMenuTarget variant="outline" className="w-48">
          invoice.xlsm
        </ContextMenuTarget>
        <Menu aria-label="Artefact actions">
          <MenuItem>
            <Pencil />
            Rename
          </MenuItem>
          <MenuItem>
            <Copy />
            Copy hash
          </MenuItem>
        </Menu>
      </ContextMenuTrigger>
      <ContextMenuTrigger>
        <ContextMenuTarget variant="outline" className="w-48">
          payload.dll
        </ContextMenuTarget>
        <Menu aria-label="Artefact actions">
          <MenuItem>
            <Pencil />
            Rename
          </MenuItem>
          <MenuItem>
            <Copy />
            Copy hash
          </MenuItem>
        </Menu>
      </ContextMenuTrigger>
    </div>
  ),
}

/**
 * A right click on something that cannot be a button: three table rows.
 */
export const OnARow: Story = {
  render: function OnARowStory() {
    const rows = ['WKS-FIN01', 'SRV-DC02', 'WKS-HR14']
    const [at, setAt] = useState<(PointerAt & { row: string }) | null>(null)
    return (
      <div className="w-72 rounded-lg border border-border">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((row) => (
              <tr
                key={row}
                className="border-b border-border last:border-b-0"
                onContextMenu={(event) => {
                  event.preventDefault()
                  setAt({ x: event.clientX, y: event.clientY, row })
                }}
              >
                <td className="px-3 py-2">{row}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <PointerContextMenu
          at={at}
          onClose={() => {
            setAt(null)
          }}
          label={at?.row ?? 'row'}
        >
          <Menu aria-label={`More for ${at?.row ?? 'row'}`}>
            <MenuItem>
              <Pencil />
              Edit in full
            </MenuItem>
            <MenuItem>
              <Copy />
              {`Copy ${at?.row ?? ''}`}
            </MenuItem>
            <MenuItem>
              <Trash2 />
              Delete
            </MenuItem>
          </Menu>
        </PointerContextMenu>
      </div>
    )
  },
}
