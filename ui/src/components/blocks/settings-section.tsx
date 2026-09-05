import type { ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/field'
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/ui/frame'

/**
 * A framed group of settings rows.
 */
export function SettingsSection({
  title,
  summary,
  children,
}: {
  /** The name of the group, in the header. */
  title: string
  /** One line under the title. */
  summary?: string | undefined
  /** `SettingsRow` and `AbsentRow` children. */
  children: ReactNode
}) {
  return (
    <Frame className="w-full">
      <FrameHeader>
        <FrameTitle>{title}</FrameTitle>
        {summary !== undefined && summary !== '' && (
          <FrameDescription>{summary}</FrameDescription>
        )}
      </FrameHeader>
      <FramePanel className="@container flex flex-col p-0">{children}</FramePanel>
    </Frame>
  )
}

/**
 * One row: a name on the left, a control on the right.
 */
export function SettingsRow({
  label,
  description,
  htmlFor,
  children,
}: {
  /** The name of the setting. */
  label: string
  /** One line under the name. */
  description?: string | undefined
  /** The id of the control this row's name belongs to. */
  htmlFor?: string | undefined
  /** The control. */
  children: ReactNode
}) {
  return (
    <div
      role="group"
      data-slot="settings-row"
      className="flex w-full flex-col gap-2 border-b border-border px-4 py-4 last:border-b-0 @md:flex-row @md:items-start @md:gap-4"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 @md:max-w-sm">
        {htmlFor === undefined ? (
          <span data-slot="settings-row-label" className="text-sm font-medium text-ink">
            {label}
          </span>
        ) : (
          <Label htmlFor={htmlFor}>{label}</Label>
        )}
        {description !== undefined && description !== '' && (
          <p className="text-xs text-ink-muted">{description}</p>
        )}
      </div>
      <div data-slot="settings-row-content" className="flex min-w-0 flex-1 flex-col">
        {children}
      </div>
    </div>
  )
}

/**
 * A row for something this install does not offer.
 */
export function AbsentRow({
  label,
  description,
}: {
  label: string
  description: string
}) {
  return (
    <SettingsRow label={label} description={description}>
      <Badge variant="soft" size="sm" className="w-fit rounded-md">
        Not configured
      </Badge>
    </SettingsRow>
  )
}
