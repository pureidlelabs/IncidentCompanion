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
 *
 * - `title` and `summary` fill the frame's tinted header.
 * - The panel carries no padding of its own; each row supplies its own.
 * - Rows stack with a rule between them.
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
 *
 * - Stacks below the `@md` container width and sits in a line above it.
 * - The label column is capped at `max-w-sm`, so a long description does not
 *   push the control off the row.
 * - `htmlFor` makes the name a `<label>` bound to that control. Without it the
 *   name is plain text, for a row whose control has its own name.
 *
 * **A row claims no grouping of its own.** It carried `role="group"`, unnamed,
 * on every row -- including the four call sites whose content is an `Alert` or
 * an avatar beside a line of text, where there is no set of controls to group
 * at all. Naming it from `label` is worse rather than better: the control in a
 * row already carries that name, from the `<Label>` this row binds with
 * `htmlFor` or from its own `aria-label`, so the row and the field read out the
 * same words one after the other -- three stories' `getByLabelText` began
 * matching two elements the moment the group took a name. Every other `group`
 * in this tree is React Aria's own and is named.
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
 *
 * Draws a tag rather than a disabled control: a greyed switch states that the
 * feature is off, which is a different claim from nothing having set it.
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
