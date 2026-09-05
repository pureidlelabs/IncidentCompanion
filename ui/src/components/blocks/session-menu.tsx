import { CircleUser, Info, Keyboard, LogOut } from 'lucide-react'
import type { ReactNode } from 'react'

import { signOut } from '@/api/client'
import {
  MenuItem,
  MenuLabel,
  MenuRadioItem,
  MenuSectionGroup,
  MenuSeparator,
  MenuShortcut,
} from '@/components/ui/menu'
import { THEME_OPTIONS, type Theme } from '@/lib/theme-preference'

/**
 * The rail's user menu: the analyst's own screen, the ground, and the way out.
 */
export function sessionRows(
  username: string,
  theme: Theme,
  setTheme: (next: Theme) => void,
  onAccount: () => void,
  onShortcuts: () => void,
  onAbout: () => void,
): ReactNode {
  return (
    <>
      <MenuLabel>{username}</MenuLabel>
      <MenuSeparator />
      <MenuSectionGroup>
        <MenuItem id="account" onAction={onAccount}>
          <CircleUser />
          Your account
        </MenuItem>
      </MenuSectionGroup>
      <MenuSectionGroup
        title="Ground"
        selectionMode="single"
        selectedKeys={[theme]}
        onSelectionChange={(keys) => {
          if (keys === 'all') return
          const [chosen] = [...keys]
          if (typeof chosen === 'string') setTheme(chosen as Theme)
        }}
      >
        {THEME_OPTIONS.map((option) => {
          const Icon = option.icon
          return (
            <MenuRadioItem key={option.value} id={option.value} textValue={option.label}>
              <Icon />
              {option.label}
            </MenuRadioItem>
          )
        })}
      </MenuSectionGroup>
      <MenuSeparator />
      <MenuSectionGroup>
        {/* **Both rails reach the cheat sheet from here.** The chord layer
            binds `?` inside a case; the picker has no chord layer, so without
            this row the shortcuts are unreachable from half the app. */}
        <MenuItem id="shortcuts" onAction={onShortcuts}>
          <Keyboard />
          Keyboard shortcuts
          <MenuShortcut>?</MenuShortcut>
        </MenuItem>
        <MenuItem id="about" onAction={onAbout}>
          <Info />
          About IncidentCompanion
        </MenuItem>
        <MenuItem
          id="signout"
          tone="destructive"
          onAction={() => {
            void signOut()
          }}
        >
          <LogOut />
          Sign out
        </MenuItem>
      </MenuSectionGroup>
    </>
  )
}
