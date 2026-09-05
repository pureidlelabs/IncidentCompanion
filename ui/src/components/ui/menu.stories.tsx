import type { Meta, StoryObj } from '@storybook/react-vite'
import { Copy, Download, Eye, Filter, Pencil, Share2, Trash2, User } from 'lucide-react'
import { expect, screen, userEvent, within } from 'storybook/test'

import { Button } from './button'
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
  MenuTrigger,
  SubmenuTrigger,
} from './menu'

/**
 * A menu of actions, opened from a `MenuTrigger`. A row with `href` navigates
 * instead of firing `onAction`.
 */
const meta = {
  title: 'Components/Menu',
  component: Menu,
  parameters: { layout: 'centered' },
  args: { children: null },
} satisfies Meta<typeof Menu>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Its own docs frame, `height` tall.
 */
function frame(height: string) {
  return { docs: { story: { inline: false, height } } }
}

/** Actions, with icons and a destructive row. */
export const Actions: Story = {
  parameters: frame('320px'),
  render: () => (
    <MenuTrigger defaultOpen>
      <Button variant="outline">Case actions</Button>
      <Menu aria-label="Case actions">
        <MenuItem>
          <Pencil />
          Rename
        </MenuItem>
        <MenuItem>
          <Copy />
          Duplicate
        </MenuItem>
        <MenuItem>
          <Download />
          Export archive
        </MenuItem>
        <MenuItem tone="destructive">
          <Trash2 />
          Delete case
        </MenuItem>
      </Menu>
    </MenuTrigger>
  ),
}

/** Sections, each with a heading that is not focusable. */
export const Sections: Story = {
  parameters: frame('420px'),
  render: () => (
    <MenuTrigger defaultOpen>
      <Button variant="outline">Report</Button>
      <Menu aria-label="Report">
        <MenuSectionGroup title="Layout">
          <MenuItem id="rca">Customer RCA</MenuItem>
          <MenuItem id="exec">Executive briefing</MenuItem>
        </MenuSectionGroup>
        <MenuSectionGroup title="Export">
          <MenuItem id="docx">Word document</MenuItem>
          <MenuItem id="pdf">PDF</MenuItem>
        </MenuSectionGroup>
      </Menu>
    </MenuTrigger>
  ),
}

/**
 * Single selection puts a tick in the gutter and reserves the space on every
 * row, so the rows do not shift as the tick moves.
 */
export const Selection: Story = {
  parameters: frame('320px'),
  render: () => (
    <MenuTrigger defaultOpen>
      <Button variant="outline">Severity</Button>
      <Menu aria-label="Severity" selectionMode="single" defaultSelectedKeys={['high']}>
        <MenuItem id="critical">Critical</MenuItem>
        <MenuItem id="high">High</MenuItem>
        <MenuItem id="medium">Medium</MenuItem>
        <MenuItem id="low">Low</MenuItem>
      </Menu>
    </MenuTrigger>
  ),
  play: async ({ step }) => {
    const menu = await screen.findByRole('menu', { name: 'Severity' })
    const rows = within(menu).getAllByRole('menuitemradio')

    await step('One row is marked, and only one', async () => {
      const chosen = rows.filter((row) => row.getAttribute('aria-checked') === 'true')
      await expect(chosen).toHaveLength(1)
      await expect(chosen[0]).toHaveTextContent('High')
    })

    await step('The gutter is reserved on every row, so nothing shifts', async () => {
      const lefts = new Set(
        rows.map((row) => Math.round(row.getBoundingClientRect().left)),
      )
      await expect(lefts.size).toBe(1)
    })
  },
}

/**
 * Shortcuts and a disabled row.
 */
export const ShortcutsAndDisabled: Story = {
  parameters: frame('220px'),
  render: () => (
    <MenuTrigger defaultOpen>
      <Button variant="outline">Edit</Button>
      <Menu aria-label="Edit" disabledKeys={['paste']} onAction={() => undefined}>
        <MenuItem id="copy">
          Copy
          <MenuShortcut>Ctrl C</MenuShortcut>
        </MenuItem>
        <MenuItem id="paste">
          Paste
          <MenuShortcut>Ctrl V</MenuShortcut>
        </MenuItem>
      </Menu>
    </MenuTrigger>
  ),
  play: async ({ step }) => {
    const menu = await screen.findByRole('menu', { name: 'Edit' })
    const rows = within(menu).getAllByRole('menuitem')

    await step('The disabled row says so', async () => {
      const paste = rows.find((row) => row.textContent.includes('Paste'))!
      await expect(paste).toHaveAttribute('aria-disabled', 'true')
    })

    await step('And the arrows cannot reach it', async () => {
      await userEvent.keyboard('{ArrowDown}{ArrowDown}')
      const paste = rows.find((row) => row.textContent.includes('Paste'))!
      await expect(paste).not.toHaveFocus()
    })
  },
}

/** A submenu. The parent row keeps its chevron. */
export const Submenu: Story = {
  parameters: frame('220px'),
  render: () => (
    <MenuTrigger defaultOpen>
      <Button variant="outline">More</Button>
      <Menu aria-label="More">
        <MenuItem id="open">Open</MenuItem>
        <SubmenuTrigger>
          <MenuItem id="export">Export as</MenuItem>
          <Menu aria-label="Export as">
            <MenuItem id="docx">Word</MenuItem>
            <MenuItem id="csv">CSV</MenuItem>
          </Menu>
        </SubmenuTrigger>
      </Menu>
    </MenuTrigger>
  ),
}

/** Checkbox rows. The section carries `selectionMode="multiple"`; the tick sits on the left. */
export const CheckboxItems: Story = {
  parameters: frame('380px'),
  render: () => (
    <MenuTrigger defaultOpen>
      <Button variant="outline">
        <Eye />
        Columns
      </Button>
      <Menu aria-label="Columns">
        <MenuLabel>Timeline columns</MenuLabel>
        <MenuSectionGroup aria-label="Columns" selectionMode="multiple" defaultSelectedKeys={['when', 'host']}>
          <MenuCheckboxItem id="when">When</MenuCheckboxItem>
          <MenuCheckboxItem id="host">Host</MenuCheckboxItem>
          <MenuCheckboxItem id="analyst">Analyst</MenuCheckboxItem>
          <MenuCheckboxItem id="source">Source</MenuCheckboxItem>
        </MenuSectionGroup>
      </Menu>
    </MenuTrigger>
  ),
}

/** Radio rows. One chosen in the run, marked with a dot rather than a tick. */
export const RadioItems: Story = {
  parameters: frame('500px'),
  render: () => (
    <MenuTrigger defaultOpen>
      <Button variant="outline">
        <Filter />
        Sort
      </Button>
      <Menu aria-label="Sort">
        <MenuSectionGroup title="Order" selectionMode="single" defaultSelectedKeys={['newest']}>
          <MenuRadioItem id="newest">Newest first</MenuRadioItem>
          <MenuRadioItem id="oldest">Oldest first</MenuRadioItem>
          <MenuRadioItem id="severity">Severity</MenuRadioItem>
        </MenuSectionGroup>
        <MenuSeparator />
        <MenuSectionGroup title="Group by" selectionMode="single" defaultSelectedKeys={['none']}>
          <MenuRadioItem id="none">Nothing</MenuRadioItem>
          <MenuRadioItem id="host">Host</MenuRadioItem>
        </MenuSectionGroup>
      </Menu>
    </MenuTrigger>
  ),
}

/** Separators and a top-level label, with no section headings. */
export const SeparatorsAndLabel: Story = {
  parameters: frame('360px'),
  render: () => (
    <MenuTrigger defaultOpen>
      <Button variant="outline">
        <User />
        analyst@soc
      </Button>
      <Menu aria-label="Account">
        <MenuLabel>Signed in as analyst@soc</MenuLabel>
        <MenuSeparator />
        <MenuItem>
          <User />
          Account
        </MenuItem>
        <MenuItem>
          <Share2 />
          Sessions
          <MenuItemDetail>3 open</MenuItemDetail>
        </MenuItem>
        <MenuSeparator />
        <MenuItem tone="destructive">Sign out</MenuItem>
      </Menu>
    </MenuTrigger>
  ),
}

/** `inset` lines a row with no icon up against the rows that have one. */
export const InsetAndDetail: Story = {
  parameters: frame('340px'),
  render: () => (
    <MenuTrigger defaultOpen>
      <Button variant="outline">Artefact</Button>
      <Menu aria-label="Artefact">
        <MenuItem>
          <Copy />
          Copy hash
        </MenuItem>
        <MenuItem>
          <Download />
          Download
          <MenuItemDetail>1.4 MB</MenuItemDetail>
        </MenuItem>
        <MenuItem inset>
          Reanalyse
          <MenuItemDetail>queued</MenuItemDetail>
        </MenuItem>
        <MenuSeparator />
        <MenuItem inset tone="destructive">
          Remove
          <MenuShortcut>Del</MenuShortcut>
        </MenuItem>
      </Menu>
    </MenuTrigger>
  ),
}

/** Everything at once: label, sections, submenus, ticks, shortcuts, a disabled row. */
export const Everything: Story = {
  parameters: frame('800px'),
  render: () => (
    <MenuTrigger defaultOpen>
      <Button variant="outline">Case</Button>
      <Menu aria-label="Case" disabledKeys={['archive']} className="min-w-56">
        <MenuLabel>BEC-2026-0413</MenuLabel>
        <MenuSeparator />
        <MenuItem>
          <Pencil />
          Rename
          <MenuShortcut>F2</MenuShortcut>
        </MenuItem>
        <MenuItem>
          <Copy />
          Duplicate
        </MenuItem>
        <SubmenuTrigger>
          <MenuItem>
            <Download />
            Export as
          </MenuItem>
          <Menu aria-label="Export as">
            <MenuItem>Word</MenuItem>
            <MenuItem>CSV</MenuItem>
            <SubmenuTrigger>
              <MenuItem>Archive</MenuItem>
              <Menu aria-label="Archive">
                <MenuItem>With evidence</MenuItem>
                <MenuItem>Report only</MenuItem>
              </Menu>
            </SubmenuTrigger>
          </Menu>
        </SubmenuTrigger>
        <MenuSeparator />
        <MenuSectionGroup title="Show" selectionMode="multiple" defaultSelectedKeys={['drafts']}>
          <MenuCheckboxItem id="drafts">Draft entries</MenuCheckboxItem>
          <MenuCheckboxItem id="system">System events</MenuCheckboxItem>
        </MenuSectionGroup>
        <MenuSectionGroup title="Density" selectionMode="single" defaultSelectedKeys={['comfortable']}>
          <MenuRadioItem id="comfortable">Comfortable</MenuRadioItem>
          <MenuRadioItem id="compact">Compact</MenuRadioItem>
        </MenuSectionGroup>
        <MenuSeparator />
        <MenuItem id="archive" inset>
          Archive
          <MenuItemDetail>read-only</MenuItemDetail>
        </MenuItem>
        <MenuItem tone="destructive">
          <Trash2 />
          Delete case
          <MenuShortcut>Del</MenuShortcut>
        </MenuItem>
      </Menu>
    </MenuTrigger>
  ),
}

/**
 * Walk the rows with the arrow keys, or run the pointer down them.
 */
export const TravellingHighlight: Story = {
  render: () => (
    <MenuTrigger>
      <Button variant="outline">Artefact actions</Button>
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
        <MenuItem>
          <Eye />
          Open in viewer
        </MenuItem>
        <MenuItem>
          <Share2 />
          Share
        </MenuItem>
        <MenuSeparator />
        <MenuItem tone="destructive">
          <Trash2 />
          Delete
        </MenuItem>
      </Menu>
    </MenuTrigger>
  ),
}
