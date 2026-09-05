import { useMemo } from 'react'

import { EmptyState } from '@/components/blocks/empty-state'
import { Button } from '@/components/ui/button'
import { ListBoxItem } from '@/components/ui/list-box'
import { Select } from '@/components/ui/select'
import { TextField } from '@/components/ui/text-field'

/** One workspace a provider offers. */
export interface SourceChoice {
  id: string
  name: string
  /** Where the workspace lives, which is what tells two of one name apart. */
  detail: string
  /** The subscription it bills to, which is the second dial over the list. */
  subscription: string
  incidents: number
}

/**
 * Which workspace to read from.
 *
 * The second line is where the workspace lives, which is the only thing telling
 * two of one name apart - and two of one name is the ordinary case, not the
 * edge one.
 *
 * **Both dials filter what is already here.** One sign-in reaches every
 * workspace the account can read, so the listing was fetched whole and
 * narrowing it asks the provider nothing.
 */
export function ProviderWorkspacePicker({
  sources,
  name,
  onName,
  subscription,
  onSubscription,
  value,
  onValue,
  onDisconnect,
}: {
  sources: readonly SourceChoice[]
  name: string
  onName: (next: string) => void
  subscription: string
  onSubscription: (next: string) => void
  value: string
  onValue: (next: string) => void
  onDisconnect: () => void
}) {
  const subscriptions = useMemo(
    () => ['Any', ...new Set(sources.map((one) => one.subscription))],
    [sources],
  )
  const shown = useMemo(
    () =>
      sources.filter(
        (one) =>
          one.name.toLowerCase().includes(name.trim().toLowerCase()) &&
          (subscription === 'Any' || one.subscription === subscription),
      ),
    [sources, name, subscription],
  )

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <TextField label="Name" className="w-56" value={name} onChange={onName} />
        <Select
          label="Subscription"
          className="w-56"
          selectedKey={subscription}
          onSelectionChange={(key) => {
            onSubscription(String(key))
          }}
        >
          {subscriptions.map((one) => (
            <ListBoxItem key={one} id={one}>
              {one}
            </ListBoxItem>
          ))}
        </Select>
        <Button variant="outline" onPress={onDisconnect}>
          Disconnect
        </Button>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title="No workspace to read from"
          detail={
            sources.length === 0
              ? 'The account this install signed in as can see no workspace in that tenant.'
              : 'Nothing in that subscription matches the name typed above.'
          }
        />
      ) : (
        <Select
          label="Workspace"
          multiline
          className="max-w-md"
          selectedKey={value}
          onSelectionChange={(key) => {
            onValue(String(key))
          }}
        >
          {shown.map((one) => (
            <ListBoxItem key={one.id} id={one.id} textValue={`${one.name} ${one.detail}`}>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm">{one.name}</span>
                <span className="truncate text-2xs text-ink-muted">
                  {`${one.detail} \u00b7 ${String(one.incidents)} incidents`}
                </span>
              </span>
            </ListBoxItem>
          ))}
        </Select>
      )}
    </div>
  )
}
