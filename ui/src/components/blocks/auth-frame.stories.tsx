import type { Meta, StoryObj } from '@storybook/react-vite'
import { Info, Monitor, Moon, Sun } from 'lucide-react'
import { expect } from 'storybook/test'

import { AuthFrame } from '@/components/blocks/auth-frame'
import { Mark } from '@/components/ui/mark'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { TextField } from '@/components/ui/text-field'
import { ToggleButton, ToggleButtonGroup } from '@/components/ui/toggle-button'
import { TypedLine, typingSeconds } from '@/components/ui/typed-line'

const FIRST_BEAT = 'Untangling the intrusion is the hard part.'

/**
 * The two lines the wide pane carries, as the product says them.
 *
 * **They type themselves in**, which is the pane's one piece of motion: the
 * copy is the first thing on an otherwise empty pane, so it reads as the
 * sentence arriving. The second beat waits out the first line's own typing
 * time rather than a hard-coded delay, so the gap survives an edit to the copy.
 */
const ATMOSPHERE = (
  <>
    <TypedLine text={FIRST_BEAT} />
    <TypedLine
      text={'The report shouldn\u2019t be.'}
      delay={typingSeconds(FIRST_BEAT) + 0.35}
      className="block font-normal text-ink-muted"
    />
  </>
)

const corner = (
  <>
    <Button variant="ghost" size="icon" aria-label="About IncidentCompanion">
      <Info aria-hidden />
    </Button>
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

/** Username, password and the submit - the shape all three auth screens share. */
function SignInForm() {
  return (
    <form className="flex flex-col gap-4">
      <TextField label="Username" autoComplete="username" defaultValue="r.okonkwo" />
      <TextField label="Password" type="password" autoComplete="current-password" />
      <Checkbox>Stay signed in</Checkbox>
      <p className="text-xs text-ink-muted">
        An administrator resets a password you cannot produce.
      </p>
      <Button type="submit" size="lg">
        Sign in
      </Button>
    </form>
  )
}

/**
 * The frame the three unauthenticated screens are drawn in.
 *
 * Two panes above 1024px: the atmosphere on the wide side, the form on a fixed
 * one. Below that the atmosphere pane is not drawn and the form is the whole
 * viewport.
 *
 * The stories run full-screen, because the frame is `min-h-screen` and a padded
 * canvas reports the wrong split between the panes.
 */
const meta = {
  title: 'Blocks/Auth/Frame',
  component: AuthFrame,
  parameters: { layout: 'fullscreen' },
  args: {
    title: 'Sign in',
    lede: 'This install holds your cases on this machine only.',
    mark: <Mark className="size-12" />,
    atmosphere: ATMOSPHERE,
    corner,
    children: <SignInForm />,
  },
} satisfies Meta<typeof AuthFrame>

export default meta
type Story = StoryObj<typeof meta>

/** The screen an analyst meets first. */
export const SignIn: Story = {
  name: 'Sign in',
  /**
   * The form offers no control that is not a field.
   *
   * Recovery goes through an administrator, so there is nowhere to send
   * anybody: the way out is a sentence. A target-size floor asks about a
   * control, and a sentence is not one, so what is asserted here is that the
   * form draws no link at all.
   */
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('a[data-slot="link"]')).toBeNull()
    await expect(
      canvasElement.textContent,
      'the frame says where a forgotten password is reset',
    ).toContain('An administrator resets a password you cannot produce.')
  },
}

/**
 * The first-run claim: no atmosphere, and a form long enough to push the
 * masthead up the pane.
 */
export const FirstRun: Story = {
  name: 'First run, with an empty atmosphere slot',
  args: {
    title: 'Claim this install',
    lede: 'The first account is the one that can make the others.',
    atmosphere: undefined,
    children: (
      <form className="flex flex-col gap-4">
        <TextField label="Username" autoComplete="username" />
        <TextField label="Display name" autoComplete="name" />
        <TextField label="Password" type="password" autoComplete="new-password" />
        <TextField
          label="Repeat password"
          type="password"
          autoComplete="new-password"
          description="At least 12 characters. Nothing else is required."
        />
        <Button type="submit" size="lg">
          Claim
        </Button>
      </form>
    ),
  },
}

/**
 * The forced password change, which arrives carrying a reason.
 *
 * An alert above the fields is the widest thing the form pane holds; it wraps
 * inside `--auth-pane-w` rather than widening it.
 */
export const ForcedChange: Story = {
  name: 'A forced password change',
  args: {
    title: 'Change your password',
    lede: undefined,
    children: (
      <div className="flex flex-col gap-4">
        <Alert variant="warning">
          <AlertTitle>Your password was set by someone else</AlertTitle>
          <AlertDescription>
            Nothing in this case is readable until you choose one of your own.
          </AlertDescription>
        </Alert>
        <form className="flex flex-col gap-4">
          <TextField label="Current password" type="password" autoComplete="current-password" />
          <TextField label="New password" type="password" autoComplete="new-password" />
          <TextField label="Repeat new password" type="password" autoComplete="new-password" />
          <Button type="submit" size="lg">
            Change password
          </Button>
        </form>
      </div>
    ),
  },
}

/**
 * A title and a lede longer than the masthead.
 *
 * Both wrap centred inside `max-w-sm`; the form below them does not move, which
 * is what the centred-masthead-over-left-form split is for.
 */
export const OverlongMasthead: Story = {
  name: 'A title longer than the masthead',
  args: {
    title: 'Sign in to the Meridian incident workspace',
    lede: 'This install holds your cases on this machine only, and nothing it stores leaves it - no telemetry, no cloud, no outbound request of any kind.',
  },
}

/** No corner and no mark: the frame with both optional slots empty. */
export const Bare: Story = {
  name: 'No mark, no corner',
  args: { mark: undefined, corner: undefined },
}
