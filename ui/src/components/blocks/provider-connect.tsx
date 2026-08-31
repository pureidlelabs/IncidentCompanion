import { useState } from 'react'

import { FormCell, FormSection } from '@/components/blocks/form-section'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/text-field'

/**
 * The connection: whose directory, whose app registration, and who is signed in.
 *
 * **An install with no importer says so rather than drawing a form.** A form
 * that cannot connect is a promise about a provider this deployment has never
 * been given.
 *
 * **Once the coordinates are set this step is a sentence.** They are an
 * install's setup, entered once; re-reading two opaque GUIDs at the start of
 * every import asks the analyst to check something they cannot check.
 */
export function ProviderConnect({
  connected,
  identity,
  tenantId,
  onTenantId,
  clientId,
  onClientId,
}: {
  connected: boolean
  identity: string
  tenantId: string
  onTenantId: (next: string) => void
  clientId: string
  onClientId: (next: string) => void
}) {
  const configured = tenantId.trim() !== '' && clientId.trim() !== ''
  const [changing, setChanging] = useState(!configured || identity === '')

  if (!connected) {
    return (
      <Alert variant="warning">
        <AlertTitle>This install cannot reach a provider</AlertTitle>
        <AlertDescription>
          No importer is configured, so there is nothing to sign in to. The rest of the case is
          unaffected.
        </AlertDescription>
      </Alert>
    )
  }

  if (!changing) {
    return (
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <span>{identity ? `Signed in as ${identity}.` : 'Ready to sign in.'}</span>
        <span className="font-mono text-xs text-ink-muted">{tenantId}</span>
        <Button
          variant="ghost"
          size="sm"
          onPress={() => {
            setChanging(true)
          }}
        >
          Change
        </Button>
      </div>
    )
  }

  return (
    <FormSection
      title="Your app registration"
      detail="You sign in with your own account and your own permissions. The token stays in this browser for the session and is never written to the case."
    >
      <FormCell>
        <TextField
          label="Directory (tenant) ID"
          description="Kept in this browser, not in the case."
          value={tenantId}
          onChange={onTenantId}
        />
      </FormCell>
      <FormCell>
        <TextField label="Application (client) ID" value={clientId} onChange={onClientId} />
      </FormCell>
      {configured && identity !== '' && (
        <FormCell>
          <Button
            variant="ghost"
            size="sm"
            onPress={() => {
              setChanging(false)
            }}
          >
            Done
          </Button>
        </FormCell>
      )}
    </FormSection>
  )
}
