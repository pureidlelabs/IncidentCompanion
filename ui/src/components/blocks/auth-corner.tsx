import { Info, Monitor, Moon, Sun } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { ToggleButton, ToggleButtonGroup } from '@/components/ui/toggle-button'

/**
 * Theme and an About door. Never more than the two.
 *
 * **The ground switch is uncontrolled on purpose.** The gallery's ground is
 * the toolbar's, so this draws which one is chosen and does not claim to be
 * what chooses it; the app hands the same control a real preference.
 */
export function AuthCorner() {
  const [about, setAbout] = useState(false)
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        // The browser tier reaches this door by handle rather than by its
        // label: `auth-about` is what `auth.spec.ts` clicks, and it was left
        // on `LegacyAuthFrame` when this corner replaced it -- so the spec
        // waited fifteen seconds for a testid no shipped bundle carried.
        data-testid="auth-about"
        aria-label="About IncidentCompanion"
        onPress={() => {
          setAbout(true)
        }}
      >
        <Info aria-hidden />
      </Button>
      <Dialog isOpen={about} onOpenChange={setAbout}>
        <DialogHeader
          title="IncidentCompanion"
          onClose={() => {
            setAbout(false)
          }}
        />
        <DialogBody>
          <p className="text-sm text-ink-muted">
            Licensed under the GNU General Public License v3.0.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button
            variant="outline"
            onPress={() => {
              setAbout(false)
            }}
          >
            Close
          </Button>
        </DialogFooter>
      </Dialog>
      <ToggleButtonGroup
        variant="segmented"
        selectionMode="single"
        defaultSelectedKeys={['system']}
        aria-label="Ground"
      >
        <ToggleButton id="light" size="icon-sm" aria-label="Light">
          <Sun aria-hidden />
        </ToggleButton>
        <ToggleButton id="dark" size="icon-sm" aria-label="Dark">
          <Moon aria-hidden />
        </ToggleButton>
        <ToggleButton id="system" size="icon-sm" aria-label="System">
          <Monitor aria-hidden />
        </ToggleButton>
      </ToggleButtonGroup>
    </>
  )
}
